// The flavor profile vocabulary classify-recipes picks from (tags rows with
// kind = 'taste'). Admins can add more taste tags through the admin form;
// these are only the ones the classifier knows. Lives apart from
// recipeClassification.ts, which pulls in @anthropic-ai/sdk.

export const TASTE_TAGS = [
  "sweet",
  "sour",
  "bitter",
  "boozy",
  "refreshing",
  "fruity",
  "spicy",
  "creamy",
] as const;
export type TasteTag = (typeof TASTE_TAGS)[number];
