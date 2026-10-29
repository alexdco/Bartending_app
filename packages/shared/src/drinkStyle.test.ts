import { describe, expect, it } from "vitest";
import { drinkStyleDisplay, isDrinkStyle, noteLength } from "./drinkStyle";

describe("drinkStyleDisplay", () => {
  it("hides the section when there is no family", () => {
    expect(drinkStyleDisplay(null, null)).toBeNull();
    expect(drinkStyleDisplay(null, "A tart, bright sour.")).toBeNull();
  });

  it("shows the label and sentence for a family", () => {
    expect(drinkStyleDisplay("sour", "A tart, bright sour.")).toEqual({
      label: "sour",
      note: "A tart, bright sour.",
    });
  });

  it("shows only the label when there is no sentence", () => {
    expect(drinkStyleDisplay("highball", null)).toEqual({ label: "highball", note: null });
  });

  it("hides the label for other, and the section without a sentence", () => {
    expect(drinkStyleDisplay("other", "A layered dessert drink.")).toEqual({
      label: null,
      note: "A layered dessert drink.",
    });
    expect(drinkStyleDisplay("other", null)).toBeNull();
  });
});

describe("isDrinkStyle", () => {
  it("accepts only the fixed families", () => {
    expect(isDrinkStyle("tiki")).toBe(true);
    expect(isDrinkStyle("martini")).toBe(false);
    expect(isDrinkStyle(null)).toBe(false);
  });
});

describe("noteLength", () => {
  it("counts code points, not UTF-16 units", () => {
    expect(noteLength("🍋")).toBe(1);
    expect(noteLength("añejo")).toBe(5);
  });
});
