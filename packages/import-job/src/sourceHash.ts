import { createHash } from "node:crypto";

/**
 * Spec 0056 AC-5: a fingerprint of exactly the fields an import would write
 * for one recipe, after overrides. A locked recipe whose stored source_hash
 * differs from the latest one is "changed upstream". Pure.
 *
 * The `v1:` prefix lets a future format change be rebaselined on purpose
 * instead of flagging every locked recipe.
 */
export const SOURCE_HASH_VERSION = "v1";

export interface SourceHashIngredient {
  readonly ingredientName: string;
  readonly measure: string | null;
  readonly sortOrder: number;
}

export interface SourceHashInput {
  readonly name: string;
  readonly glass: string | null;
  readonly alcoholicStatus: string;
  /** TheCocktailDB only; custom recipes have no IBA. */
  readonly iba?: string | null;
  /** Hashed only when the import would write it (see the callers). */
  readonly instructions?: string;
  readonly ingredients: readonly SourceHashIngredient[];
  readonly tags: readonly { readonly tagName: string }[];
}

type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

/** JSON with object keys sorted at every level, so key order never changes the hash. */
export function canonicalJson(value: CanonicalValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((item: CanonicalValue) => canonicalJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, CanonicalValue>)[key] ?? null)}`,
      );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sourceHash(input: SourceHashInput): string {
  const ingredients = [...input.ingredients]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((line) => [line.ingredientName, line.measure, line.sortOrder] as const);
  const tags = input.tags.map((tag) => tag.tagName).sort();

  const fields: { [key: string]: CanonicalValue } = {
    name: input.name,
    glass: input.glass,
    alcoholicStatus: input.alcoholicStatus,
    ingredients,
    tags,
    ...(input.iba !== undefined ? { iba: input.iba } : {}),
    ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
  };

  const digest = createHash("sha256").update(canonicalJson(fields)).digest("hex");
  return `${SOURCE_HASH_VERSION}:${digest}`;
}

/**
 * A TheCocktailDB drink's hash: instructions count only when the overrides
 * replace them, since the import never rewrites them otherwise.
 */
export function catalogSourceHash(drink: {
  readonly recipe: {
    readonly name: string;
    readonly instructions: string;
    readonly instructionsOverride: boolean;
    readonly glass: string | null;
    readonly alcoholicStatus: string;
    readonly iba: string | null;
  };
  readonly ingredients: readonly SourceHashIngredient[];
  readonly tags: readonly { readonly tagName: string }[];
}): string {
  return sourceHash({
    name: drink.recipe.name,
    glass: drink.recipe.glass,
    alcoholicStatus: drink.recipe.alcoholicStatus,
    iba: drink.recipe.iba,
    ...(drink.recipe.instructionsOverride ? { instructions: drink.recipe.instructions } : {}),
    ingredients: drink.ingredients,
    tags: drink.tags,
  });
}
