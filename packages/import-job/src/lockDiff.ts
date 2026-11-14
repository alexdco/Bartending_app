import { z } from "zod";
import { catalogNameKey } from "@bartendingapp/shared/catalog-names";
import type { OverriddenDrink } from "./overrides";

/**
 * Spec 0056 AC-8: the backfill diff. Lists every unlocked live TheCocktailDB
 * recipe whose stored content differs from what the import would write, so
 * an admin edit made before the lock existed can be locked before the first
 * real import undoes it. Pure: plain data in, plain data out.
 *
 * Each side is normalized the way admin_upsert_recipe compares (AC-1), so a
 * recipe saved unchanged in admin is never a candidate. Ingredient lines
 * compare ingredient and measure text in order; parsed amounts, instructions,
 * and IBA are not compared.
 */

export type LockField = "name" | "glass" | "alcoholicStatus" | "ingredients" | "tags";

export interface StoredLockRow {
  readonly sourceId: string;
  readonly name: string;
  readonly glass: string | null;
  readonly alcoholicStatus: string;
  readonly ingredients: readonly {
    /** ingredients.normalized_name */
    readonly normalizedName: string;
    readonly measure: string | null;
    readonly sortOrder: number;
  }[];
  /** normalized_name of each catalog kind tag on the recipe */
  readonly catalogTags: readonly string[];
}

export interface LockCandidate {
  readonly sourceId: string;
  readonly name: string;
  readonly fields: readonly LockField[];
}

const blankToNull = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

const glassKey = (glass: string | null): string | null => blankToNull(glass)?.toLowerCase() ?? null;

type IngredientLine = readonly [string, string | null];

const sameLines = (a: readonly IngredientLine[], b: readonly IngredientLine[]): boolean =>
  a.length === b.length && a.every((line, i) => line[0] === b[i]?.[0] && line[1] === b[i]?.[1]);

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((value) => right.has(value));
};

/** Order by position (the import numbers from 1, the admin form from 0), then name. */
const orderedLines = (
  lines: readonly {
    readonly name: string;
    readonly measure: string | null;
    readonly sortOrder: number;
  }[],
): readonly IngredientLine[] =>
  [...lines]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((line) => [line.name, blankToNull(line.measure)] as const);

interface Line {
  readonly name: string;
  readonly measure: string | null;
  readonly sortOrder: number;
}

/**
 * The rows the import actually stores for a source ingredient list. A source
 * that lists the same ingredient twice (lemon juice, then a lemon slice) hits
 * import_catalog's `on conflict (recipe_id, ingredient_id) do update`: one
 * row, keeping the first line's position and the last line's measure.
 */
const collapseDuplicates = (lines: readonly Line[]): readonly Line[] =>
  [...lines]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .reduce<readonly Line[]>((rows, line) => {
      const existing = rows.find((row) => row.name === line.name);
      return existing
        ? rows.map((row) => (row === existing ? { ...existing, measure: line.measure } : row))
        : [...rows, line];
    }, []);

/** The import owned fields that differ between a stored row and its source drink. */
export function diffLockFields(
  stored: StoredLockRow,
  source: OverriddenDrink,
  nonCatalogTagNames: ReadonlySet<string>,
): readonly LockField[] {
  const storedLines = orderedLines(
    stored.ingredients.map((line) => ({ ...line, name: line.normalizedName })),
  );
  const sourceLines = orderedLines(
    collapseDuplicates(
      source.ingredients.map((line) => ({
        name: catalogNameKey(line.ingredientName),
        measure: line.measure,
        sortOrder: line.sortOrder,
      })),
    ),
  );

  // A payload tag whose name is already a taste tag is linked as that taste
  // tag, so it is never part of the stored catalog set.
  const sourceTags = source.tags
    .map((tag) => catalogNameKey(tag.tagName))
    .filter((tag) => tag !== "" && !nonCatalogTagNames.has(tag));

  const checks: readonly (readonly [LockField, boolean])[] = [
    ["name", stored.name.trim() !== source.recipe.name.trim()],
    ["glass", glassKey(stored.glass) !== glassKey(source.recipe.glass)],
    ["alcoholicStatus", stored.alcoholicStatus !== source.recipe.alcoholicStatus],
    ["ingredients", !sameLines(storedLines, sourceLines)],
    ["tags", !sameSet(stored.catalogTags, sourceTags)],
  ];

  return checks.filter(([, differs]) => differs).map(([field]) => field);
}

/**
 * Every stored row that differs from its source drink. A stored row with no
 * drink in the payload (hidden or gone from TheCocktailDB) has nothing to
 * compare against and is left out.
 */
export function findLockCandidates(
  stored: readonly StoredLockRow[],
  drinks: readonly OverriddenDrink[],
  nonCatalogTagNames: ReadonlySet<string>,
): readonly LockCandidate[] {
  const drinksBySourceId = new Map(drinks.map((drink) => [drink.recipe.sourceId, drink]));

  return stored.flatMap((row) => {
    const source = drinksBySourceId.get(row.sourceId);
    if (!source) {
      return [];
    }
    const fields = diffLockFields(row, source, nonCatalogTagNames);
    return fields.length > 0 ? [{ sourceId: row.sourceId, name: row.name, fields }] : [];
  });
}

const lockCandidatesFileSchema = z.array(z.object({ sourceId: z.string().min(1) }).passthrough());

export type ParseLockCandidatesResult =
  { data: readonly string[]; error: null } | { data: null; error: string };

/** The source ids left in a reviewed lock-candidates.json, deduplicated. */
export function parseLockCandidatesFile(raw: unknown): ParseLockCandidatesResult {
  const parsed = lockCandidatesFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      data: null,
      error: parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; "),
    };
  }
  return { data: [...new Set(parsed.data.map((entry) => entry.sourceId))], error: null };
}
