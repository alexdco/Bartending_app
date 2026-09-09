"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import {
  buildSearchPerformedEvent,
  type AlcoholicStatusFilter,
  type RecipeSearchResult,
} from "@bartendingapp/shared";
import { track } from "@/analytics/posthog-client";
import { RecipeCard } from "./recipe-card";
import { useRecipeSearch } from "./use-recipe-search";

const STATUS_FILTERS: { value: AlcoholicStatusFilter; label: string }[] = [
  { value: "alcoholic", label: "Alcoholic" },
  { value: "non_alcoholic", label: "Non alcoholic" },
  { value: "optional", label: "Optional alcohol" },
];

const DEBOUNCE_MS = 300;

export interface SearchPageClientProps {
  initialResults: RecipeSearchResult[];
}

export function SearchPageClient({ initialResults }: SearchPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";

  const [inputValue, setInputValue] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState<AlcoholicStatusFilter | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(inputValue.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [inputValue]);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    const url = trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search";
    router.replace(url, { scroll: false });
  }, [debouncedQuery, router]);

  const isDefaultQuery = debouncedQuery === "" && statusFilter === null;

  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useRecipeSearch({
      query: debouncedQuery,
      statusFilter,
      initialData: isDefaultQuery ? initialResults : undefined,
    });

  const results = useMemo(() => data?.pages.flat() ?? [], [data]);

  const lastFiredQueryRef = useRef<string | null>(null);

  useEffect(() => {
    if (!debouncedQuery || isPending || isFetchingNextPage) {
      return;
    }
    if (lastFiredQueryRef.current === debouncedQuery) {
      return;
    }

    const firstPage = data?.pages[0];
    if (!firstPage) {
      return;
    }

    lastFiredQueryRef.current = debouncedQuery;
    const event = buildSearchPerformedEvent({
      query: debouncedQuery,
      result_count: firstPage.length,
    });
    track(event.name, event.properties);
  }, [debouncedQuery, data, isPending, isFetchingNextPage]);

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
      <Text variant="display" as="h1">
        Find a recipe
      </Text>
      <Input
        label="Search by name or ingredient"
        placeholder="Margarita, lime, gin..."
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
      />
      <div className="flex flex-wrap gap-two" role="group" aria-label="Filter by alcoholic status">
        {STATUS_FILTERS.map((filter) => (
          <Chip
            key={filter.value}
            selected={statusFilter === filter.value}
            onSelectedChange={(selected) => setStatusFilter(selected ? filter.value : null)}
          >
            {filter.label}
          </Chip>
        ))}
      </div>

      {error ? (
        <EmptyState
          title="Something went wrong"
          description="We couldn't load recipes. Check your connection and try again."
          action={<Button onClick={() => refetch()}>Retry</Button>}
        />
      ) : isPending ? (
        <div className="flex justify-center py-six">
          <Spinner label="Loading recipes" />
        </div>
      ) : results.length === 0 ? (
        <EmptyState title="No recipes found" description="Try a different search or filter." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-three sm:grid-cols-3 md:grid-cols-4">
            {results.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
          <div ref={sentinelRef} className="flex justify-center py-four">
            {isFetchingNextPage && <Spinner label="Loading more recipes" />}
          </div>
        </>
      )}
    </div>
  );
}
