import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, SafeAreaView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { SegmentedControl } from "@/components/segmented-control";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  buildSearchPerformedEvent,
  buildSearchSortChangedEvent,
  type AlcoholicStatusFilter,
  type RecipeSearchResult,
  type SearchSort,
} from "@bartendingapp/shared";
import { track } from "@/analytics/posthog-client";
import { RecipeCard } from "@/recipes/recipe-card";
import { useSearchSort } from "@/recipes/search-sort-context";
import { useRecipeSearch } from "@/recipes/use-recipe-search";
import { useMocktailsOnly } from "@/mocktails/mocktails-context";
import { SubmitRecipePrompt } from "@/submissions/submission-prompts";

const STATUS_FILTERS: { value: AlcoholicStatusFilter; label: string }[] = [
  { value: "alcoholic", label: "Alcoholic" },
  { value: "non_alcoholic", label: "Non alcoholic" },
  { value: "optional", label: "Optional alcohol" },
];

const DEBOUNCE_MS = 300;

export default function SearchScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  // Spec 0061 AC-10: the sort lives above the navigator, so it survives back.
  const [sort, setSort] = useSearchSort();
  const listRef = useRef<FlatList<RecipeSearchResult>>(null);
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AlcoholicStatusFilter | null>(null);
  // Spec 0063 AC-5: no status chips in mocktails only mode; useRecipeSearch
  // also ignores any status left in state.
  const mocktailsOnly = useMocktailsOnly();

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(inputValue.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [inputValue]);

  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useRecipeSearch({ query: debouncedQuery, statusFilter, sort });

  const handleSortChange = (next: SearchSort) => {
    const event = buildSearchSortChangedEvent({
      from: sort,
      to: next,
      has_query: debouncedQuery !== "",
    });
    track(event.name, event.properties);
    setSort(next);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const results = useMemo<RecipeSearchResult[]>(() => data?.pages.flat() ?? [], [data]);

  const lastFiredQueryRef = useRef<string | null>(null);

  useEffect(() => {
    if (!debouncedQuery || isPending || isFetchingNextPage) {
      return;
    }
    // Spec 0061 AC-13: once per query and sort, so a sort change fires again.
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="display">Find a recipe</Text>
        <Input
          label="Search by name or ingredient"
          placeholder="Margarita, lime, gin..."
          value={inputValue}
          onChangeText={setInputValue}
        />
        {!mocktailsOnly && (
          <View style={styles.filters}>
            {STATUS_FILTERS.map((filter) => (
              <Chip
                key={filter.value}
                selected={statusFilter === filter.value}
                onSelectedChange={(selected) => setStatusFilter(selected ? filter.value : null)}
              >
                {filter.label}
              </Chip>
            ))}
          </View>
        )}
        <SegmentedControl
          label={t("search.sortLabel")}
          options={[
            { value: "popular", label: t("search.sortPopular") },
            { value: "az", label: t("search.sortAz") },
          ]}
          value={sort}
          onValueChange={handleSortChange}
        />
      </View>

      {error ? (
        <EmptyState
          title="Something went wrong"
          description="We couldn't load recipes. Check your connection and try again."
          action={<Button onPress={() => refetch()}>Retry</Button>}
        />
      ) : isPending ? (
        <View style={styles.centered}>
          <Spinner label="Loading recipes" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={results}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <RecipeCard recipe={item} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }}
          ListEmptyComponent={
            mocktailsOnly ? (
              <EmptyState title={t("search.mocktailsEmpty")} />
            ) : (
              <EmptyState
                title="No recipes found"
                description="Try a different search or filter."
              />
            )
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.centered}>
                <Spinner label="Loading more recipes" />
              </View>
            ) : !hasNextPage && !mocktailsOnly ? (
              // Spec 0064 AC-21: ends the results and follows the empty state;
              // hidden in mocktails only mode (AC-20).
              <SubmitRecipePrompt />
            ) : null
          }
        />
      )}
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
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  row: {
    gap: Spacing.three,
  },
  centered: {
    alignItems: "center",
    paddingVertical: Spacing.six,
  },
});
