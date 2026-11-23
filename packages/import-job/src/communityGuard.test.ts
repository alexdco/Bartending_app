import { describe, expect, it } from "vitest";
import { parseCatalogOverrides } from "./catalogOverridesSchema";

/**
 * Spec 0064 AC-22, invariant 7: the import never touches a community recipe.
 *
 * The database side (import_catalog, import_custom_recipes, reset, and fame
 * on arrival run against a community recipe) is checked by
 * supabase/tests/recipe_submissions_safety_check.sql. This half locks the
 * client side input: merges, hides, and fixes match recipes by source_id, so
 * the overrides file must never be able to name a community recipe's
 * `community-<uuid>` id. Lock and the image and lock reads filter
 * `source = 'catalog'` in their queries.
 */
const COMMUNITY_ID = "community-3f1c2a9e-8b7d-4c1e-9f0a-123456789abc";

const base = { hide: {}, recipes: {}, unlistedIngredientSynonyms: {}, staples: [] };

describe("catalog overrides can't name a community recipe (spec 0064 AC-22)", () => {
  it("rejects a community id as a hidden recipe", () => {
    expect(() =>
      parseCatalogOverrides({ ...base, hide: { [COMMUNITY_ID]: { reason: "crude" } } }),
    ).toThrow(/numeric id/);
  });

  it("rejects a community id as a merge target", () => {
    expect(() =>
      parseCatalogOverrides({
        ...base,
        hide: { "13751": { reason: "duplicate", mergeInto: COMMUNITY_ID } },
      }),
    ).toThrow(/numeric id/);
  });

  it("rejects a community id as a recipe fix", () => {
    expect(() =>
      parseCatalogOverrides({ ...base, recipes: { [COMMUNITY_ID]: { name: "Renamed" } } }),
    ).toThrow(/numeric id/);
  });

  it("still accepts TheCocktailDB ids", () => {
    expect(() =>
      parseCatalogOverrides({
        ...base,
        hide: { "13751": { reason: "duplicate", mergeInto: "11000" } },
        recipes: { "11000": { name: "Mojito" } },
      }),
    ).not.toThrow();
  });
});
