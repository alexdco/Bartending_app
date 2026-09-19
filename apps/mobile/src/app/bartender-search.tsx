import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, SafeAreaView, StyleSheet, View } from "react-native";
import type { BartenderSearchResult, SearchResultTier } from "@bartendingapp/shared";

import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useCurrentBar } from "@/service/use-current-bar";
import { useBartenderSearch } from "@/service/use-bartender-search";
import { useBartenderModeGuard } from "@/service/use-bartender-mode-guard";

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
      onPress={() =>
        router.push(
          (result.kind === "bar_recipe"
            ? `/bartender-build/bar_recipe/${result.id}`
            : `/bartender-build/recipe/${result.id}`) as never,
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
    <View style={styles.tierSection}>
      <Text variant="subheading">{TIER_LABELS[tier]}</Text>
      {visible.map((result) => (
        <ResultRow key={`${result.kind}-${result.id}`} result={result} />
      ))}
      {!expanded && results.length > TIER_PREVIEW_COUNT && (
        <Button variant="secondary" onPress={() => setExpanded(true)}>
          {`See ${results.length - TIER_PREVIEW_COUNT} more`}
        </Button>
      )}
    </View>
  );
}

// Search screen for Bartender Mode (spec 0023-search-and-shorthand.md).
// Tiers are rendered in the fixed order the RPC returns them in, per AC-1;
// this screen only groups and displays, it never re-sorts across tiers.
export default function BartenderSearchScreen() {
  const theme = useTheme();
  const currentBar = useCurrentBar();
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const bartenderModeAllowed = useBartenderModeGuard();

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(inputValue.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [inputValue]);

  const barId = currentBar.currentBar?.id ?? null;
  const search = useBartenderSearch(debouncedQuery, barId);

  if (!bartenderModeAllowed) {
    return null;
  }

  const resultsByTier = new Map<SearchResultTier, BartenderSearchResult[]>();
  for (const result of search.data ?? []) {
    const existing = resultsByTier.get(result.tier) ?? [];
    existing.push(result);
    resultsByTier.set(result.tier, existing);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="display">Search</Text>
        <Input
          label="Cocktail name, shorthand, or ingredients"
          placeholder="old f, marg, esp mart, gin campari vermouth..."
          value={inputValue}
          onChangeText={setInputValue}
          autoFocus
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {debouncedQuery === "" ? (
          <EmptyState
            title="Start typing"
            description='Try a full name, a shorthand like "esp mart", or a list of ingredients.'
          />
        ) : search.error ? (
          <EmptyState
            title="Something went wrong"
            description="Check your connection and try again."
            action={<Button onPress={() => search.refetch()}>Retry</Button>}
          />
        ) : search.isPending ? (
          <View style={styles.centered}>
            <Spinner label="Searching" />
          </View>
        ) : (search.data ?? []).length === 0 ? (
          <EmptyState title="No matches" description="Try a different name or ingredient." />
        ) : (
          ([1, 2, 3, 4, 5, 6, 7] as SearchResultTier[]).map((tier) => (
            <TierSection key={tier} tier={tier} results={resultsByTier.get(tier) ?? []} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    gap: Spacing.three,
    padding: Spacing.four,
  },
  content: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  tierSection: {
    gap: Spacing.two,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.six,
  },
});
