import { useEffect, useMemo, useState } from "react";
import { FlatList, SafeAreaView, StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { AlcoholicStatusFilter, RecipeSearchResult } from "@bartendingapp/shared";
import { RecipeCard } from "@/recipes/recipe-card";
import { useRecipeSearch } from "@/recipes/use-recipe-search";

const STATUS_FILTERS: { value: AlcoholicStatusFilter; label: string }[] = [
  { value: "alcoholic", label: "Alcoholic" },
  { value: "non_alcoholic", label: "Non alcoholic" },
  { value: "optional", label: "Optional alcohol" },
];

const DEBOUNCE_MS = 300;

export default function SearchScreen() {
  const theme = useTheme();
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AlcoholicStatusFilter | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(inputValue.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [inputValue]);

  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useRecipeSearch({ query: debouncedQuery, statusFilter });

  const results = useMemo<RecipeSearchResult[]>(() => data?.pages.flat() ?? [], [data]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text variant="display">Find a recipe</Text>
        <Input
          label="Search by name or ingredient"
          placeholder="Margarita, lime, gin..."
          value={inputValue}
          onChangeText={setInputValue}
        />
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
            <EmptyState title="No recipes found" description="Try a different search or filter." />
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.centered}>
                <Spinner label="Loading more recipes" />
              </View>
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
