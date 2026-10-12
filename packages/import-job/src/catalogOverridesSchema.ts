import { z } from "zod";

// Spec 0036: the shape of catalogOverrides.json. Cross entry rules (unknown
// ids, hidden targets, cycles) live in validateOverrides in overrides.ts,
// because they need the fetched source to check against.

const sourceId = z.string().regex(/^\d+$/, "must be a TheCocktailDB numeric id");

const hideEntrySchema = z.discriminatedUnion("reason", [
  z
    .object({ reason: z.literal("duplicate"), name: z.string().optional(), mergeInto: sourceId })
    .strict(),
  z.object({ reason: z.literal("crude"), name: z.string().optional() }).strict(),
]);

const addedIngredientSchema = z
  .object({
    ingredientName: z.string().trim().min(1),
    measure: z.string().trim().min(1).nullable(),
  })
  .strict();

const recipeFixSchema = z
  .object({
    name: z.string().optional(),
    addIngredients: z.array(addedIngredientSchema).min(1).optional(),
    instructions: z.string().trim().min(1).optional(),
    reviewed: z.boolean().optional(),
    note: z.string().optional(),
  })
  .strict();

export const catalogOverridesSchema = z
  .object({
    hide: z.record(sourceId, hideEntrySchema),
    recipes: z.record(sourceId, recipeFixSchema),
    unlistedIngredientSynonyms: z.record(
      z.string().refine((key) => key === key.trim().toLowerCase() && key.length > 0, {
        message: "synonym keys must be lowercased, trimmed phrases",
      }),
      z.string().min(1),
    ),
    staples: z.array(z.string().trim().min(1)),
  })
  .strict();

export type CatalogOverrides = z.infer<typeof catalogOverridesSchema>;
export type HideEntry = z.infer<typeof hideEntrySchema>;
export type RecipeFix = z.infer<typeof recipeFixSchema>;

export function parseCatalogOverrides(raw: unknown): CatalogOverrides {
  const result = catalogOverridesSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`catalogOverrides.json is invalid:\n${issues}`);
  }
  return result.data;
}
