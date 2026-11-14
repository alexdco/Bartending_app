import { z } from "zod";

/**
 * The jsonb report import_catalog and import_custom_recipes return
 * (spec 0056 AC-13). Pure: parse the RPC result, format the printed lines.
 */
const reportRecipeSchema = z.object({ sourceId: z.string(), name: z.string() });

const importReportSchema = z.object({
  lockedSkipped: z.array(reportRecipeSchema).default([]),
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

const formatRecipes = (recipes: readonly ReportRecipe[]): readonly string[] =>
  recipes.map((recipe) => `    ${recipe.sourceId}  ${recipe.name}`);

/** The freshness report lines, one heading per list with its count and entries. */
export function formatFreshnessReport(report: ImportReport): readonly string[] {
  return [
    "Freshness report:",
    `  locked recipes skipped: ${report.lockedSkipped.length}`,
    ...formatRecipes(report.lockedSkipped),
  ];
}
