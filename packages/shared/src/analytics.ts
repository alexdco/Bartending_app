import type { SearchSort } from "./recipes";

export const ANALYTICS_EVENT_NAMES = {
  searchPerformed: "search_performed",
  pantryItemAdded: "pantry_item_added",
  drinkIdeaGenerated: "drink_idea_generated",
  recipeFavorited: "recipe_favorited",
  quizSourceLinkClicked: "quiz_source_link_clicked",
  searchSortChanged: "search_sort_changed",
  recipeSubmissionSaved: "recipe_submission_saved",
  recipeSubmissionWithdrawn: "recipe_submission_withdrawn",
  recipeSubmissionFormOpened: "recipe_submission_form_opened",
  substitutesShown: "substitutes_shown",
} as const;

export interface SearchPerformedProperties {
  query: string;
  result_count: number;
  /** Spec 0061 AC-13: the sort used for the page this event reports. */
  sort: SearchSort;
}

// Spec 0061 AC-13: a user (never a restore) changed the search sort.
export interface SearchSortChangedProperties {
  from: SearchSort;
  to: SearchSort;
  has_query: boolean;
}

export interface PantryItemAddedProperties {
  ingredient_id: string;
}

export type DrinkIdeaGeneratedSource = "matched" | "ai";

export interface DrinkIdeaGeneratedProperties {
  source: DrinkIdeaGeneratedSource;
  pantry_size: number;
  match_count?: number;
}

export interface RecipeFavoritedProperties {
  recipe_id: string;
  is_favorited: boolean;
}

// Spec 0042 AC-9: a quiz result screen source link (inline or "Read more").
export interface QuizSourceLinkClickedProperties {
  quiz_id: string;
  question_id: string;
  target_kind: "article" | "recipe";
  was_correct: boolean;
}

// Spec 0064: ids and flags only, never recipe text or names (invariant 8).
export interface RecipeSubmissionSavedProperties {
  is_resubmit: boolean;
  has_photo: boolean;
  locale: string;
}

export type RecipeSubmissionWithdrawnProperties = Record<string, never>;

export type RecipeSubmissionFormEntry = "menu" | "search";

export interface RecipeSubmissionFormOpenedProperties {
  entry: RecipeSubmissionFormEntry;
}

/** The submit form's `from` param: `search` from the search prompt, anything else counts as `menu`. */
export function parseRecipeSubmissionFormEntry(
  from: string | null | undefined,
): RecipeSubmissionFormEntry {
  return from === "search" ? "search" : "menu";
}

export function buildRecipeSubmissionSavedEvent(
  properties: RecipeSubmissionSavedProperties,
): AnalyticsEvent<RecipeSubmissionSavedProperties> {
  return { name: ANALYTICS_EVENT_NAMES.recipeSubmissionSaved, properties };
}

export function buildRecipeSubmissionWithdrawnEvent(): AnalyticsEvent<RecipeSubmissionWithdrawnProperties> {
  return { name: ANALYTICS_EVENT_NAMES.recipeSubmissionWithdrawn, properties: {} };
}

export function buildRecipeSubmissionFormOpenedEvent(
  properties: RecipeSubmissionFormOpenedProperties,
): AnalyticsEvent<RecipeSubmissionFormOpenedProperties> {
  return { name: ANALYTICS_EVENT_NAMES.recipeSubmissionFormOpened, properties };
}

export interface AnalyticsEvent<Properties> {
  name: string;
  properties: Properties;
}

export function buildSearchPerformedEvent(
  properties: SearchPerformedProperties,
): AnalyticsEvent<SearchPerformedProperties> {
  return { name: ANALYTICS_EVENT_NAMES.searchPerformed, properties };
}

export function buildSearchSortChangedEvent(
  properties: SearchSortChangedProperties,
): AnalyticsEvent<SearchSortChangedProperties> {
  return { name: ANALYTICS_EVENT_NAMES.searchSortChanged, properties };
}

export function buildPantryItemAddedEvent(
  properties: PantryItemAddedProperties,
): AnalyticsEvent<PantryItemAddedProperties> {
  return { name: ANALYTICS_EVENT_NAMES.pantryItemAdded, properties };
}

export function buildDrinkIdeaGeneratedEvent(
  properties: DrinkIdeaGeneratedProperties,
): AnalyticsEvent<DrinkIdeaGeneratedProperties> {
  return { name: ANALYTICS_EVENT_NAMES.drinkIdeaGenerated, properties };
}

export function buildRecipeFavoritedEvent(
  properties: RecipeFavoritedProperties,
): AnalyticsEvent<RecipeFavoritedProperties> {
  return { name: ANALYTICS_EVENT_NAMES.recipeFavorited, properties };
}

export function buildQuizSourceLinkClickedEvent(
  properties: QuizSourceLinkClickedProperties,
): AnalyticsEvent<QuizSourceLinkClickedProperties> {
  return { name: ANALYTICS_EVENT_NAMES.quizSourceLinkClicked, properties };
}

// Spec 0065 AC-12: one event per 86'd ingredient block the Quick Build banner shows.
export interface SubstitutesShownProperties {
  ingredient_id: string;
  shown_count: number;
  outcome: "shown" | "none_known" | "none_in_stock" | "not_reviewed";
  recipe_kind: "catalog" | "house";
  platform: string;
}

export function buildSubstitutesShownEvent(
  properties: SubstitutesShownProperties,
): AnalyticsEvent<SubstitutesShownProperties> {
  return { name: ANALYTICS_EVENT_NAMES.substitutesShown, properties };
}
