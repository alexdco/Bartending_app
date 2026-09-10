import { describe, expect, it } from "vitest";
import {
  ANALYTICS_EVENT_NAMES,
  buildDrinkIdeaGeneratedEvent,
  buildPantryItemAddedEvent,
  buildSearchPerformedEvent,
} from "./analytics";

describe("analytics event builders", () => {
  it("search_performed carries exactly query and result_count", () => {
    const event = buildSearchPerformedEvent({ query: "margarita", result_count: 12 });
    expect(event.name).toBe(ANALYTICS_EVENT_NAMES.searchPerformed);
    expect(Object.keys(event.properties).sort()).toEqual(["query", "result_count"]);
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
});
