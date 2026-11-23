import { describe, expect, it } from "vitest";
import {
  buildQuizSourceLinkClickedEvent,
  ANALYTICS_EVENT_NAMES,
  buildDrinkIdeaGeneratedEvent,
  buildPantryItemAddedEvent,
  buildSearchPerformedEvent,
  buildSearchSortChangedEvent,
  buildRecipeSubmissionFormOpenedEvent,
  buildRecipeSubmissionSavedEvent,
  buildRecipeSubmissionWithdrawnEvent,
  parseRecipeSubmissionFormEntry,
} from "./analytics";

describe("recipe submission events (spec 0064)", () => {
  it("recipe_submission_saved carries exactly is_resubmit, has_photo, locale", () => {
    const event = buildRecipeSubmissionSavedEvent({
      is_resubmit: true,
      has_photo: false,
      locale: "ja",
    });
    expect(event.name).toBe("recipe_submission_saved");
    expect(event.properties).toEqual({ is_resubmit: true, has_photo: false, locale: "ja" });
  });

  it("recipe_submission_withdrawn carries no properties", () => {
    const event = buildRecipeSubmissionWithdrawnEvent();
    expect(event.name).toBe("recipe_submission_withdrawn");
    expect(event.properties).toEqual({});
  });

  it("recipe_submission_form_opened carries exactly entry", () => {
    const event = buildRecipeSubmissionFormOpenedEvent({ entry: "search" });
    expect(event.name).toBe("recipe_submission_form_opened");
    expect(event.properties).toEqual({ entry: "search" });
  });

  it("parseRecipeSubmissionFormEntry maps only `search` to search", () => {
    expect(parseRecipeSubmissionFormEntry("search")).toBe("search");
    expect(parseRecipeSubmissionFormEntry(null)).toBe("menu");
    expect(parseRecipeSubmissionFormEntry("menu")).toBe("menu");
    expect(parseRecipeSubmissionFormEntry("other")).toBe("menu");
  });
});

describe("analytics event builders", () => {
  it("search_performed carries exactly query, result_count, and sort (spec 0061 AC-13)", () => {
    const event = buildSearchPerformedEvent({ query: "margarita", result_count: 12, sort: "az" });
    expect(event.name).toBe(ANALYTICS_EVENT_NAMES.searchPerformed);
    expect(Object.keys(event.properties).sort()).toEqual(["query", "result_count", "sort"]);
  });

  it("search_sort_changed carries exactly from, to, has_query (spec 0061 AC-13)", () => {
    const event = buildSearchSortChangedEvent({ from: "popular", to: "az", has_query: false });
    expect(event.name).toBe("search_sort_changed");
    expect(event.properties).toEqual({ from: "popular", to: "az", has_query: false });
  });

  it("pantry_item_added carries exactly ingredient_id", () => {
    const event = buildPantryItemAddedEvent({ ingredient_id: "abc-123" });
    expect(event.name).toBe(ANALYTICS_EVENT_NAMES.pantryItemAdded);
    expect(Object.keys(event.properties).sort()).toEqual(["ingredient_id"]);
  });

  it("drink_idea_generated (matched) carries exactly source, pantry_size, match_count", () => {
    const event = buildDrinkIdeaGeneratedEvent({
      source: "matched",
      pantry_size: 5,
      match_count: 3,
    });
    expect(event.name).toBe(ANALYTICS_EVENT_NAMES.drinkIdeaGenerated);
    expect(Object.keys(event.properties).sort()).toEqual(["match_count", "pantry_size", "source"]);
  });

  it("drink_idea_generated (ai) carries exactly source and pantry_size", () => {
    const event = buildDrinkIdeaGeneratedEvent({ source: "ai", pantry_size: 5 });
    expect(event.name).toBe(ANALYTICS_EVENT_NAMES.drinkIdeaGenerated);
    expect(Object.keys(event.properties).sort()).toEqual(["pantry_size", "source"]);
  });

  it("quiz_source_link_clicked carries exactly quiz_id, question_id, target_kind, was_correct (covers spec 0042 AC-9)", () => {
    const event = buildQuizSourceLinkClickedEvent({
      quiz_id: "quiz-1",
      question_id: "question-1",
      target_kind: "recipe",
      was_correct: false,
    });
    expect(event.name).toBe("quiz_source_link_clicked");
    expect(event.properties).toEqual({
      quiz_id: "quiz-1",
      question_id: "question-1",
      target_kind: "recipe",
      was_correct: false,
    });
  });
});
