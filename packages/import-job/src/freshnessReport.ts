import { z } from "zod";

/**
 * The jsonb report import_catalog and import_custom_recipes return
 * (spec 0056 AC-13). Pure: parse the RPC result, format the printed lines.
 */
const reportRecipeSchema = z.object({ sourceId: z.string(), name: z.string() });

const importReportSchema = z.object({
  lockedSkipped: z.array(reportRecipeSchema).default([]),
  changedUpstream: z.array(reportRecipeSchema).default([]),
  // TheCocktailDB only (AC-4): the custom import has no "missing from file"
  // step, so its report leaves these out and they aren't printed.
  keptMissing: z.array(reportRecipeSchema).optional(),
  lockedStillDeleted: z.array(reportRecipeSchema).optional(),
});

export type ReportRecipe = z.infer<typeof reportRecipeSchema>;
export type ImportReport = z.infer<typeof importReportSchema>;

export type ParseImportReportResult =
  { data: ImportReport; error: null } | { data: null; error: string };

export function parseImportReport(raw: unknown): ParseImportReportResult {
  const parsed = importReportSchema.safeParse(raw);
  return parsed.success
    ? { data: parsed.data, error: null }
    : { data: null, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
}

/** The catalogOverrides.json recipe fix keys that change content (not `reviewed` or `note`). */
const CONTENT_FIX_KEYS = ["name", "instructions", "addIngredients"] as const;

/**
 * Content overrides that had no effect because their recipe is locked
 * (AC-2, AC-13): keys of `overrides.recipes` with a content fix, intersected
 * with the run's lockedSkipped list.
 */
export function findIgnoredOverrides(
  recipeFixes: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
  lockedSkipped: readonly ReportRecipe[],
): readonly ReportRecipe[] {
  return lockedSkipped.filter((recipe) => {
    const fix = recipeFixes[recipe.sourceId];
    return fix !== undefined && CONTENT_FIX_KEYS.some((key) => fix[key] !== undefined);
  });
}

const formatRecipes = (recipes: readonly ReportRecipe[]): readonly string[] =>
  recipes.map((recipe) => `    ${recipe.sourceId}  ${recipe.name}`);

const formatSection = (heading: string, recipes: readonly ReportRecipe[]): readonly string[] => [
  `  ${heading}: ${recipes.length}`,
  ...formatRecipes(recipes),
];

/** The freshness report lines, one heading per list with its count and entries. */
export function formatFreshnessReport(
  report: ImportReport,
  ignoredOverrides?: readonly ReportRecipe[],
): readonly string[] {
  return [
    "Freshness report:",
    ...formatSection("locked recipes skipped", report.lockedSkipped),
    ...formatSection("locked recipes changed upstream", report.changedUpstream),
    ...(report.keptMissing
      ? formatSection("locked recipes kept though gone from source", report.keptMissing)
      : []),
    ...(report.lockedStillDeleted
      ? formatSection(
          "locked recipes still deleted (Reset brings them back)",
          report.lockedStillDeleted,
        )
      : []),
    ...(ignoredOverrides
      ? formatSection("overrides ignored because the recipe is locked", ignoredOverrides)
      : []),
  ];
}
