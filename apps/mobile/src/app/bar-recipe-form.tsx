import { useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { BAR_FORM_UNITS, type BarFormUnit } from "@bartendingapp/shared";

import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useIngredientSearch } from "@/pantry/use-ingredient-search";
import { useCurrentBar } from "@/service/use-current-bar";
import { useCreateBarRecipe } from "@/service/use-bar-mutations";
import { useBartenderModeGuard } from "@/service/use-bartender-mode-guard";

const UNITS = BAR_FORM_UNITS;

interface DraftIngredient {
  ingredientId: string;
  name: string;
  amountValue: string;
  amountUnit: BarFormUnit;
}

function AddIngredientRow({ onAdd }: { onAdd: (ingredient: DraftIngredient) => void }) {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const ingredientSearch = useIngredientSearch(query.trim());

  return (
    <View style={styles.addIngredientRow}>
      <Input
        label="Add an ingredient"
        placeholder="Bourbon, Aperol, lemon juice..."
        value={query}
        onChangeText={setQuery}
      />
      {query.trim() !== "" && (ingredientSearch.data ?? []).length > 0 && (
        <View
          style={[
            styles.suggestions,
            { borderColor: theme.border, backgroundColor: theme.surface },
          ]}
        >
          {(ingredientSearch.data ?? []).map((ingredient) => (
            <Button
              key={ingredient.id}
              variant="secondary"
              onPress={() => {
                onAdd({
                  ingredientId: ingredient.id,
                  name: ingredient.name,
                  amountValue: "",
                  amountUnit: "oz",
                });
                setQuery("");
              }}
            >
              {ingredient.name}
            </Button>
          ))}
        </View>
      )}
    </View>
  );
}

// House recipe creation (AC-4). base_recipe_id is left unset for MVP: the
// form always creates a standalone bar_recipe rather than offering to
// override a catalog recipe, since the "search a catalog recipe as a base"
// picker is a meaningfully sized second flow of its own (deferred, see
// spec 0023-bar-data-model.md's build plan step 6 note). An owner can still
// achieve the same practical result by naming the house recipe after the
// classic it's based on and entering its own ratios directly.
export default function BarRecipeFormScreen() {
  const theme = useTheme();
  const currentBar = useCurrentBar();
  const barId = currentBar.currentBar?.id;
  const createBarRecipe = useCreateBarRecipe(barId ?? "");

  const [name, setName] = useState("");
  const [method, setMethod] = useState("");
  const [straining, setStraining] = useState("");
  const [glass, setGlass] = useState("");
  const [ice, setIce] = useState("");
  const [garnish, setGarnish] = useState("");
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
  const bartenderModeAllowed = useBartenderModeGuard();

  if (!bartenderModeAllowed) {
    return null;
  }

  const isOwner = barId !== undefined;
  const canSave = isOwner && name.trim() !== "" && ingredients.length > 0;

  const updateIngredient = (index: number, patch: Partial<DraftIngredient>) => {
    setIngredients((current) =>
      current.map((ingredient, i) => (i === index ? { ...ingredient, ...patch } : ingredient)),
    );
  };

  const removeIngredient = (index: number) => {
    setIngredients((current) => current.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!barId) {
      return;
    }

    createBarRecipe.mutate({
      barId,
      name: name.trim(),
      method: method.trim() || null,
      straining: straining.trim() || null,
      glass: glass.trim() || null,
      ice: ice.trim() || null,
      garnish: garnish.trim() || null,
      ingredients: ingredients.map((ingredient, index) => ({
        ingredientId: ingredient.ingredientId,
        amountValue: ingredient.amountValue.trim() === "" ? null : Number(ingredient.amountValue),
        amountUnit: ingredient.amountValue.trim() === "" ? null : ingredient.amountUnit,
        sortOrder: index,
      })),
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton />
        <Text variant="display">Add house recipe</Text>

        {!isOwner ? (
          <EmptyState
            title="No bar selected"
            description="Create or select a bar first, then add a house recipe."
          />
        ) : (
          <View style={styles.form}>
            <Input label="Name" placeholder="Paper Plane" value={name} onChangeText={setName} />
            <Input
              label="Method (optional)"
              placeholder="Shake"
              value={method}
              onChangeText={setMethod}
            />
            <Input
              label="Straining (optional)"
              placeholder="Double strain"
              value={straining}
              onChangeText={setStraining}
            />
            <Input
              label="Glass (optional)"
              placeholder="Coupe"
              value={glass}
              onChangeText={setGlass}
            />
            <Input label="Ice (optional)" placeholder="None" value={ice} onChangeText={setIce} />
            <Input
              label="Garnish (optional)"
              placeholder="Lemon twist"
              value={garnish}
              onChangeText={setGarnish}
            />

            <Text variant="subheading">Ingredients</Text>
            {ingredients.map((ingredient, index) => (
              <View key={`${ingredient.ingredientId}-${index}`} style={styles.ingredientRow}>
                <Text variant="body" style={styles.ingredientName}>
                  {ingredient.name}
                </Text>
                <Input
                  label="Amount"
                  keyboardType="decimal-pad"
                  value={ingredient.amountValue}
                  onChangeText={(value) => updateIngredient(index, { amountValue: value })}
                  style={styles.amountInput}
                />
                <View style={styles.unitRow}>
                  {UNITS.map((unit) => (
                    <Button
                      key={unit}
                      variant={ingredient.amountUnit === unit ? "primary" : "secondary"}
                      onPress={() => updateIngredient(index, { amountUnit: unit })}
                    >
                      {unit}
                    </Button>
                  ))}
                </View>
                <Button variant="secondary" onPress={() => removeIngredient(index)}>
                  Remove
                </Button>
              </View>
            ))}

            <AddIngredientRow
              onAdd={(ingredient) => setIngredients((current) => [...current, ingredient])}
            />

            <Button disabled={!canSave || createBarRecipe.isPending} onPress={handleSave}>
              {createBarRecipe.isPending ? "Saving..." : "Save house recipe"}
            </Button>
            {createBarRecipe.isError && (
              <Text variant="bodySmall" style={{ color: theme.danger }}>
                Couldn&apos;t save that recipe. A house recipe with this name may already exist, or
                you may not be this bar&apos;s owner.
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: Spacing.four,
    padding: Spacing.four,
  },
  form: {
    gap: Spacing.three,
  },
  ingredientRow: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  ingredientName: {
    fontWeight: "600",
  },
  amountInput: {
    maxWidth: 120,
  },
  unitRow: {
    flexDirection: "row",
    gap: Spacing.one,
    flexWrap: "wrap",
  },
  addIngredientRow: {
    gap: Spacing.two,
  },
  suggestions: {
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
});
