"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { SegmentedControl } from "@/components/segmented-control";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import {
  buildSearchPerformedEvent,
  buildSearchSortChangedEvent,
  parseSearchSort,
  type AlcoholicStatusFilter,
  type RecipeSearchResult,
  type SearchSort,
} from "@bartendingapp/shared";
import { track } from "@/analytics/posthog-client";
import { useMocktailsState } from "@/age-gate/age-gate-store";
import { alcoholicStatusKey } from "./format";
import { RecipeCard } from "./recipe-card";
import {
  buildSearchUrl,
  readStoredSearchSort,
  tabStorage,
  writeStoredSearchSort,
} from "./search-url";
import { useRecipeSearch } from "./use-recipe-search";

const STATUS_FILTERS: readonly AlcoholicStatusFilter[] = ["alcoholic", "non_alcoholic", "optional"];

const DEBOUNCE_MS = 300;

export interface SearchPageClientProps {
  initialResults: RecipeSearchResult[];
  /** The sort the server rendered initialResults with (spec 0061 AC-8). */
  initialSort: SearchSort;
}

export function SearchPageClient({ initialResults, initialSort }: SearchPageClientProps) {
  const t = useTranslations("search");
  const tStatus = useTranslations("alcoholicStatus");
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  // Spec 0061: the URL is the single source of truth for the sort.
  const sort = parseSearchSort(searchParams.get("sort"));
  const urlQuery = (searchParams.get("q") ?? "").trim();

  const [inputValue, setInputValue] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [chosenStatusFilter, setStatusFilter] = useState<AlcoholicStatusFilter | null>(null);
  // Spec 0063 AC-5, AC-19: in mocktails only mode the status chips are gone
  // and any chosen status is ignored; nothing fetches until the mode is known.
  const mocktailsState = useMocktailsState();
  const mocktailsOnly = mocktailsState === true;
  const statusFilter = mocktailsOnly ? null : chosenStatusFilter;
  // Until the mode is known on, the server rendered list may be the full
  // catalog, so it is marked for the CSS to hide in the mode (AC-14).
  const hideInMocktails = mocktailsOnly ? undefined : "hide";

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(inputValue.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [inputValue]);

  // Typing replaces the current history entry and keeps the sort (AC-8). It
  // only writes when the typed query differs from the URL, so a sort change or
  // a restore is never overwritten by a stale URL.
  useEffect(() => {
    if (debouncedQuery.trim() === urlQuery) {
      return;
    }
    router.replace(buildSearchUrl(debouncedQuery, sort), { scroll: false });
  }, [debouncedQuery, urlQuery, sort, router]);

  // AC-9: arriving without a sort param restores the tab's last choice. Mount
  // only, so browser back to a Popular entry stays Popular. Not a user change:
  // no analytics event, no history entry.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) {
      return;
    }
    restoredRef.current = true;
    if (searchParams.has("sort")) {
      return;
    }
    if (parseSearchSort(readStoredSearchSort(tabStorage())) === "az") {
      router.replace(buildSearchUrl(searchParams.get("q") ?? "", "az"), { scroll: false });
    }
  }, [searchParams, router]);

  const handleSortChange = (next: SearchSort) => {
    const event = buildSearchSortChangedEvent({
      from: sort,
      to: next,
      has_query: debouncedQuery !== "",
    });
    track(event.name, event.properties);
    writeStoredSearchSort(tabStorage(), next);
    router.push(buildSearchUrl(debouncedQuery, next), { scroll: false });
    window.scrollTo({ top: 0 });
  };

  const isDefaultQuery = debouncedQuery === "" && statusFilter === null && sort === initialSort;

  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useRecipeSearch({
      query: debouncedQuery,
      statusFilter,
      sort,
      mocktailsOnly,
      enabled: mocktailsState !== "unknown",
      // The server list is never the mocktails list (AC-14).
      initialData: isDefaultQuery && !mocktailsOnly ? initialResults : undefined,
    });

  const results = useMemo(() => data?.pages.flat() ?? [], [data]);

  const lastFiredQueryRef = useRef<string | null>(null);

  useEffect(() => {
    if (!debouncedQuery || isPending || isFetchingNextPage) {
      return;
    }
    // AC-13: once per query and sort, so a sort change fires again.
    const firedKey = `${debouncedQuery}:${sort}`;
    if (lastFiredQueryRef.current === firedKey) {
      return;
    }

    const firstPage = data?.pages[0];
    if (!firstPage) {
      return;
    }

    lastFiredQueryRef.current = firedKey;
    const event = buildSearchPerformedEvent({
      query: debouncedQuery,
      result_count: firstPage.length,
      sort,
    });
    track(event.name, event.properties);
  }, [debouncedQuery, sort, data, isPending, isFetchingNextPage]);

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="flex flex-col gap-four p-six">
      <BackButton />
      <Text variant="display" as="h1">
        {t("title")}
      </Text>
      <Input
        label={t("inputLabel")}
        placeholder={t("inputPlaceholder")}
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
      />
      {!mocktailsOnly && (
        <div
          className="flex flex-wrap gap-two"
          role="group"
          aria-label={t("filterByStatus")}
          data-mocktails="hide"
        >
          {STATUS_FILTERS.map((filter) => (
            <Chip
              key={filter}
              selected={statusFilter === filter}
              onSelectedChange={(selected) => setStatusFilter(selected ? filter : null)}
            >
              {tStatus(alcoholicStatusKey(filter))}
            </Chip>
          ))}
        </div>
      )}
      <SegmentedControl
        label={t("sortLabel")}
        options={[
          { value: "popular", label: t("sortPopular") },
          { value: "az", label: t("sortAz") },
        ]}
        value={sort}
        onValueChange={handleSortChange}
      />

      <div className="flex flex-col gap-four" data-mocktails={hideInMocktails}>
        {error ? (
          <EmptyState
            title={t("errorTitle")}
            description={t("errorDescription")}
            action={<Button onClick={() => refetch()}>{t("retry")}</Button>}
          />
        ) : isPending ? (
          <div className="flex justify-center py-six">
            <Spinner label={t("loading")} />
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            title={t("emptyTitle")}
            description={mocktailsOnly ? t("mocktailsEmpty") : t("emptyDescription")}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-three sm:grid-cols-3 md:grid-cols-4">
              {results.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
            <div ref={sentinelRef} className="flex justify-center py-four">
              {isFetchingNextPage && <Spinner label={t("loadingMore")} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
