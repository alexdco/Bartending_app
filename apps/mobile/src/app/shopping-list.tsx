import { useEffect, useState } from "react";
import { FlatList, SafeAreaView, StyleSheet, View } from "react-native";

import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useIngredientSearch } from "@/pantry/use-ingredient-search";
import { useShoppingList } from "@/shopping-list/use-shopping-list";
import {
  useAddShoppingListItem,
  useBuyShoppingListItem,
  useRemoveShoppingListItem,
} from "@/shopping-list/use-shopping-list-mutations";

const DEBOUNCE_MS = 300;

export default function ShoppingListScreen() {
  const theme = useTheme();
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(inputValue.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [inputValue]);

  const shoppingList = useShoppingList();
  const ingredientSearch = useIngredientSearch(debouncedQuery);
  const addShoppingListItem = useAddShoppingListItem();
  const removeShoppingListItem = useRemoveShoppingListItem();
  const buyShoppingListItem = useBuyShoppingListItem();

  const shoppingListIds = new Set((shoppingList.data ?? []).map((item) => item.ingredientId));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="display">Shopping list</Text>
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
                const alreadyAdded = shoppingListIds.has(ingredient.id);
                return (
                  <View key={ingredient.id} style={styles.row}>
                    <Text variant="body">{ingredient.name}</Text>
                    <Button
                      variant="secondary"
                      disabled={alreadyAdded}
                      onPress={() =>
                        addShoppingListItem.mutate(
                          { ingredientId: ingredient.id, name: ingredient.name },
                          { onSuccess: () => setInputValue("") },
                        )
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
        {addShoppingListItem.isError && (
          <Text variant="bodySmall" style={{ color: theme.danger }}>
            Couldn&apos;t add that ingredient. Check your connection and try again.
          </Text>
        )}
        {removeShoppingListItem.isError && (
          <Text variant="bodySmall" style={{ color: theme.danger }}>
            Couldn&apos;t remove that ingredient. Check your connection and try again.
          </Text>
        )}
        {buyShoppingListItem.isError && (
          <Text variant="bodySmall" style={{ color: theme.danger }}>
            Couldn&apos;t mark that ingredient as bought. Check your connection and try again.
          </Text>
        )}
      </View>

      {shoppingList.error ? (
        <EmptyState
          title="Something went wrong"
          description="We couldn't load your shopping list. Check your connection and try again."
          action={<Button onPress={() => shoppingList.refetch()}>Retry</Button>}
        />
      ) : shoppingList.isPending ? (
        <View style={styles.centered}>
          <Spinner label="Loading shopping list" />
        </View>
      ) : (
        <FlatList
          data={shoppingList.data ?? []}
          keyExtractor={(item) => item.ingredientId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View
              style={[
                styles.shoppingListRow,
                { borderColor: theme.border, backgroundColor: theme.surface },
              ]}
            >
              <Text variant="body">{item.name}</Text>
              <View style={styles.actions}>
                <Button
                  variant="primary"
                  onPress={() => buyShoppingListItem.mutate({ ingredientId: item.ingredientId })}
                >
                  Bought
                </Button>
                <Button
                  variant="secondary"
                  onPress={() => removeShoppingListItem.mutate({ ingredientId: item.ingredientId })}
                >
                  Remove
                </Button>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              title="Your shopping list is empty"
              description="Search for an ingredient above to add it to your shopping list."
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
  shoppingListRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.six,
  },
});
