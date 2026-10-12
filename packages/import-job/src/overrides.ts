import {
  canonicalGlass,
  canonicalIngredientName,
  catalogNameKey,
  isKnownGlass,
} from "@bartendingapp/shared/catalog-names";
import { parseMeasure } from "@bartendingapp/shared/units";
import type { CatalogOverrides } from "./catalogOverridesSchema";
import type { RecipeInput, TransformedDrink } from "./transform";

// Spec 0036: applies the curated catalogOverrides.json to the transformed
// TheCocktailDB payload. Pure: plain data in, plain data out.

export interface OverriddenRecipeInput extends RecipeInput {
  /** True when the overrides file replaces this recipe's instructions. */
  instructionsOverride: boolean;
}

export interface OverriddenDrink extends Omit<TransformedDrink, "recipe"> {
  recipe: OverriddenRecipeInput;
}

export interface CatalogMerge {
  fromSourceId: string;
  toSourceId: string;
}

export interface AppliedOverrides {
  drinks: OverriddenDrink[];
  merges: CatalogMerge[];
  stapleNames: string[];
  /** Distinct source glass values GLASS_MAP doesn't know (sentence cased instead). */
  unknownGlasses: string[];
}

export interface OverridesValidation {
  errors: string[];
  warnings: string[];
}

/**
 * The AC-12 rules, checked against the fetched source before any write.
 * Errors fail the import; a `hide` key missing from the source only warns,
 * so a source change never blocks every import.
 */
export function validateOverrides(
  drinks: readonly TransformedDrink[],
  overrides: CatalogOverrides,
): OverridesValidation {
  const bySourceId = new Map(drinks.map((drink) => [drink.recipe.sourceId, drink]));
  const hiddenIds = new Set(Object.keys(overrides.hide));

  const hideWarnings = Object.keys(overrides.hide)
    .filter((id) => !bySourceId.has(id))
    .map((id) => `hide.${id}: not in the TheCocktailDB source, skipped`);

  const mergeErrors = Object.entries(overrides.hide).flatMap(([id, entry]) => {
    if (entry.reason !== "duplicate") return [];
    const target = entry.mergeInto;
    if (target === id) return [`hide.${id}: merge cycle (merges into itself)`];
    if (hiddenIds.has(target)) {
      return [
        followsBackTo(overrides, target, id)
          ? `hide.${id}: merge cycle through ${target}`
          : `hide.${id}: mergeInto ${target} is itself hidden`,
      ];
    }
    if (!bySourceId.has(target)) return [`hide.${id}: mergeInto ${target} is not in the source`];
    return [];
  });

  const recipeErrors = Object.entries(overrides.recipes).flatMap(([id, fix]) => {
    const drink = bySourceId.get(id);
    if (!drink) return [`recipes.${id}: not in the TheCocktailDB source`];
    const listed = new Set(drink.ingredients.map((i) => catalogNameKey(i.ingredientName)));
    return (fix.addIngredients ?? [])
      .filter((added) => listed.has(catalogNameKey(added.ingredientName)))
      .map(
        (added) =>
          `recipes.${id}: addIngredients names "${added.ingredientName}", which ${drink.recipe.name} already lists`,
      );
  });

  return { errors: [...mergeErrors, ...recipeErrors], warnings: hideWarnings };
}

function followsBackTo(overrides: CatalogOverrides, start: string, origin: string): boolean {
  const visited = new Set<string>();
  let current: string | undefined = start;
  while (current && !visited.has(current)) {
    if (current === origin) return true;
    visited.add(current);
    const entry: CatalogOverrides["hide"][string] | undefined = overrides.hide[current];
    current = entry?.reason === "duplicate" ? entry.mergeInto : undefined;
  }
  return false;
}

/** Staple names that match no known ingredient (by normalized name). */
export function findUnknownStaples(
  staples: readonly string[],
  knownIngredientNames: readonly string[],
): string[] {
  const known = new Set(knownIngredientNames.map(catalogNameKey));
  return staples.filter((staple) => !known.has(catalogNameKey(staple)));
}

function applyFix(drink: TransformedDrink, overrides: CatalogOverrides): OverriddenDrink {
  const fix = overrides.recipes[drink.recipe.sourceId];

  const ingredients = drink.ingredients.map((ingredient) => ({
    ...ingredient,
    ingredientName: canonicalIngredientName(ingredient.ingredientName),
  }));

  // Entries the recipe already lists are skipped, so applying the overrides
  // to their own output changes nothing (AC-4).
  const listed = new Set(ingredients.map((i) => catalogNameKey(i.ingredientName)));
  const lastSortOrder = ingredients.reduce((max, i) => Math.max(max, i.sortOrder), 0);
  const added = (fix?.addIngredients ?? [])
    .filter((entry) => !listed.has(catalogNameKey(entry.ingredientName)))
    .map((entry, index) => {
      const parsed = parseMeasure(entry.measure);
      return {
        ingredientName: canonicalIngredientName(entry.ingredientName),
        measure: entry.measure,
        sortOrder: lastSortOrder + index + 1,
        amountValue: parsed?.value ?? null,
        amountUnit: parsed?.unit ?? null,
      };
    });

  return {
    ...drink,
    recipe: {
      ...drink.recipe,
      glass: canonicalGlass(drink.recipe.glass),
      instructions: fix?.instructions ?? drink.recipe.instructions,
      instructionsOverride: fix?.instructions !== undefined,
    },
    ingredients: [...ingredients, ...added],
  };
}

/**
 * Drops hidden source ids (the import's reconciliation then soft deletes
 * them), canonicalizes glass and ingredient names, and applies per recipe
 * fixes. Merges are emitted only for hidden ids present in the source.
 */
export function applyOverrides(
  drinks: readonly TransformedDrink[],
  overrides: CatalogOverrides,
): AppliedOverrides {
  const sourceIds = new Set(drinks.map((drink) => drink.recipe.sourceId));

  const kept = drinks.filter((drink) => !(drink.recipe.sourceId in overrides.hide));

  const merges = Object.entries(overrides.hide).flatMap(([fromSourceId, entry]) =>
    entry.reason === "duplicate" && sourceIds.has(fromSourceId)
      ? [{ fromSourceId, toSourceId: entry.mergeInto }]
      : [],
  );

  const unknownGlasses = [
    ...new Set(
      kept
        .map((drink) => drink.recipe.glass)
        .filter((glass): glass is string => glass !== null && !isKnownGlass(glass)),
    ),
  ].sort();

  return {
    drinks: kept.map((drink) => applyFix(drink, overrides)),
    merges,
    stapleNames: [...overrides.staples],
    unknownGlasses,
  };
}

export interface OverridesSummary {
  hidden: number;
  merges: number;
  glassRenames: number;
  ingredientRenames: number;
  fixes: number;
  unknownGlasses: string[];
}

/** Counts for `--dry-run`: what applying the overrides changes versus the raw source. */
export function summarizeOverrides(
  source: readonly TransformedDrink[],
  applied: AppliedOverrides,
): OverridesSummary {
  const rawById = new Map(source.map((d) => [d.recipe.sourceId, d]));
  const rawIngredientNames = new Set(
    source.flatMap((d) => d.ingredients.map((i) => i.ingredientName.trim())),
  );

  return {
    hidden: source.length - applied.drinks.length,
    merges: applied.merges.length,
    glassRenames: applied.drinks.filter(
      (d) => d.recipe.glass !== rawById.get(d.recipe.sourceId)?.recipe.glass,
    ).length,
    ingredientRenames: [...rawIngredientNames].filter(
      (name) => canonicalIngredientName(name) !== name,
    ).length,
    fixes: applied.drinks.filter(
      (d) =>
        d.recipe.instructionsOverride ||
        d.ingredients.length > (rawById.get(d.recipe.sourceId)?.ingredients.length ?? 0),
    ).length,
    unknownGlasses: applied.unknownGlasses,
  };
}
