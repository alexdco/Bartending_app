import { useEffect, useState } from "react";
import { FlatList, SafeAreaView, StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useIngredientSearch } from "@/pantry/use-ingredient-search";
import { usePantry } from "@/pantry/use-pantry";
import { useAddPantryItem, useRemovePantryItem } from "@/pantry/use-pantry-mutations";

const DEBOUNCE_MS = 300;

export default function PantryScreen() {
  const theme = useTheme();
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(inputValue.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [inputValue]);

  const pantry = usePantry();
  const ingredientSearch = useIngredientSearch(debouncedQuery);
  const addPantryItem = useAddPantryItem();
  const removePantryItem = useRemovePantryItem();

  const pantryIds = new Set((pantry.data ?? []).map((item) => item.ingredientId));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text variant="display">Your pantry</Text>
        <Input
          label="Add an ingredient"
          placeholder="Lime, gin, simple syrup..."
          value={inputValue}
          onChangeText={setInputValue}
        />
        {debouncedQuery !== "" && (
          <View
            style={[
              styles.searchResults,
              { borderColor: theme.border, backgroundColor: theme.surface },
            ]}
          >
            {ingredientSearch.isPending ? (
              <View style={styles.centered}>
                <Spinner label="Searching ingredients" />
              </View>
            ) : (ingredientSearch.data ?? []).length === 0 ? (
              <Text variant="bodySmall" muted>
                No matching ingredients.
              </Text>
            ) : (
              (ingredientSearch.data ?? []).map((ingredient) => {
                const alreadyAdded = pantryIds.has(ingredient.id);
                return (
                  <View key={ingredient.id} style={styles.row}>
                    <Text variant="body">{ingredient.name}</Text>
                    <Button
                      variant="secondary"
                      disabled={alreadyAdded}
                      onPress={() =>
                        addPantryItem.mutate({ ingredientId: ingredient.id, name: ingredient.name })
                      }
                    >
                      {alreadyAdded ? "Added" : "Add"}
                    </Button>
                  </View>
                );
              })
            )}
          </View>
        )}
        {addPantryItem.isError && (
          <Text variant="bodySmall" style={{ color: theme.danger }}>
            Couldn&apos;t add that ingredient. Check your connection and try again.
          </Text>
        )}
        {removePantryItem.isError && (
          <Text variant="bodySmall" style={{ color: theme.danger }}>
            Couldn&apos;t remove that ingredient. Check your connection and try again.
          </Text>
        )}
      </View>

      {pantry.error ? (
        <EmptyState
          title="Something went wrong"
          description="We couldn't load your pantry. Check your connection and try again."
          action={<Button onPress={() => pantry.refetch()}>Retry</Button>}
        />
      ) : pantry.isPending ? (
        <View style={styles.centered}>
          <Spinner label="Loading pantry" />
        </View>
      ) : (
        <FlatList
          data={pantry.data ?? []}
          keyExtractor={(item) => item.ingredientId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View
              style={[
                styles.pantryRow,
                { borderColor: theme.border, backgroundColor: theme.surface },
              ]}
            >
              <Text variant="body">{item.name}</Text>
              <Button
                variant="secondary"
                onPress={() => removePantryItem.mutate({ ingredientId: item.ingredientId })}
              >
                Remove
              </Button>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              title="Your pantry is empty"
              description="Search for an ingredient above to add it to your pantry."
            />
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
  searchResults: {
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  pantryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.six,
  },
});
