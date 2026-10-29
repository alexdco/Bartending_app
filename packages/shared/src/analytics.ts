export const ANALYTICS_EVENT_NAMES = {
  searchPerformed: "search_performed",
  pantryItemAdded: "pantry_item_added",
  drinkIdeaGenerated: "drink_idea_generated",
  recipeFavorited: "recipe_favorited",
  quizSourceLinkClicked: "quiz_source_link_clicked",
} as const;

export interface SearchPerformedProperties {
  query: string;
  result_count: number;
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

export interface AnalyticsEvent<Properties> {
  name: string;
  properties: Properties;
}

export function buildSearchPerformedEvent(
  properties: SearchPerformedProperties,
): AnalyticsEvent<SearchPerformedProperties> {
  return { name: ANALYTICS_EVENT_NAMES.searchPerformed, properties };
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
