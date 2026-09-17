"use client";

import { useEffect, useState } from "react";
import type { BartenderSearchResult, SearchResultTier } from "@bartendingapp/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { useCurrentBar } from "@/service/use-current-bar";
import { useBartenderSearch } from "@/service/use-bartender-search";

const DEBOUNCE_MS = 200;
const TIER_PREVIEW_COUNT = 5;

const TIER_LABELS: Record<SearchResultTier, string> = {
  1: "On the menu",
  2: "House recipes",
  3: "Pinned",
  4: "Recently viewed",
  5: "Exact match",
  6: "Other matches",
  7: "By ingredients",
};

function ResultRow({ result }: { result: BartenderSearchResult }) {
  const router = useRouter();

  return (
    <Button
      variant="secondary"
      className="w-full justify-start"
      onClick={() =>
        router.push(
          result.kind === "bar_recipe"
            ? `/service/build/bar_recipe/${result.id}`
            : `/service/build/recipe/${result.id}`,
        )
      }
    >
      {result.name}
    </Button>
  );
}

function TierSection({
  tier,
  results,
}: {
  tier: SearchResultTier;
  results: BartenderSearchResult[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (results.length === 0) {
    return null;
  }

  const visible = expanded ? results : results.slice(0, TIER_PREVIEW_COUNT);

  return (
    <div className="flex flex-col gap-two">
      <Text variant="subheading">{TIER_LABELS[tier]}</Text>
      <div className="flex flex-col gap-one">
        {visible.map((result) => (
          <ResultRow key={`${result.kind}-${result.id}`} result={result} />
        ))}
      </div>
      {!expanded && results.length > TIER_PREVIEW_COUNT && (
        <Button variant="secondary" onClick={() => setExpanded(true)}>
          {`See ${results.length - TIER_PREVIEW_COUNT} more`}
        </Button>
      )}
    </div>
  );
}

// Search screen for Bartender Mode (spec 0023-search-and-shorthand.md).
// Tiers are rendered in the fixed order the RPC returns them in, per AC-1;
// this screen only groups and displays, it never re-sorts across tiers. The
// query is kept in the URL (?q=) so browser back restores it, per the Quick
// Build spec's AC-4 back-navigation resolution.
export function BartenderSearchPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const currentBar = useCurrentBar();
  const [inputValue, setInputValue] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(inputValue.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [inputValue]);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    const url = trimmed ? `/service/search?q=${encodeURIComponent(trimmed)}` : "/service/search";
    router.replace(url, { scroll: false });
  }, [debouncedQuery, router]);

  const barId = currentBar.currentBar?.id ?? null;
  const search = useBartenderSearch(debouncedQuery, barId);

  const resultsByTier = new Map<SearchResultTier, BartenderSearchResult[]>();
  for (const result of search.data ?? []) {
    const existing = resultsByTier.get(result.tier) ?? [];
    existing.push(result);
    resultsByTier.set(result.tier, existing);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-four px-four py-six">
      <BackButton />
      <Text variant="display">Search</Text>
      <Input
        label="Cocktail name, shorthand, or ingredients"
        placeholder="old f, marg, esp mart, gin campari vermouth..."
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        autoFocus
      />

      {debouncedQuery === "" ? (
        <EmptyState
          title="Start typing"
          description='Try a full name, a shorthand like "esp mart", or a list of ingredients.'
        />
      ) : search.error ? (
        <EmptyState
          title="Something went wrong"
          description="Check your connection and try again."
          action={<Button onClick={() => search.refetch()}>Retry</Button>}
        />
      ) : search.isPending ? (
        <div className="flex items-center justify-center py-six">
          <Spinner label="Searching" />
        </div>
      ) : (search.data ?? []).length === 0 ? (
        <EmptyState title="No matches" description="Try a different name or ingredient." />
      ) : (
        <div className="flex flex-col gap-four">
          {([1, 2, 3, 4, 5, 6, 7] as SearchResultTier[]).map((tier) => (
            <TierSection key={tier} tier={tier} results={resultsByTier.get(tier) ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}
