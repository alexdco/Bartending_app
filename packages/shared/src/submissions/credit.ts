/**
 * Who a recipe credits (spec 0064 AC-16). Catalog and admin recipes credit
 * nobody; a community recipe credits its author's current display name, or
 * "a community member" once the account is deleted (submitted_by null) or
 * the author has no name. Pure: each app turns this into its own string.
 */
export type RecipeCredit = { kind: "named"; name: string } | { kind: "community" };

export function toRecipeCredit(
  isCommunity: boolean | null | undefined,
  submittedByName: string | null | undefined,
): RecipeCredit | null {
  if (isCommunity !== true) return null;
  const name = submittedByName?.trim() ?? "";
  return name.length > 0 ? { kind: "named", name } : { kind: "community" };
}
