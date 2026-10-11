export type AlcoholicStatusKey = "alcoholic" | "nonAlcoholic" | "optional" | "unknown";

/** The `alcoholicStatus` message key for a recipe's alcoholic status. */
export function alcoholicStatusKey(status: string): AlcoholicStatusKey {
  switch (status) {
    case "alcoholic":
      return "alcoholic";
    case "non_alcoholic":
      return "nonAlcoholic";
    case "optional":
      return "optional";
    default:
      return "unknown";
  }
}
