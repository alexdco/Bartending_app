import { describe, expect, it } from "vitest";
import { GLASS_MAP, canonicalGlass, canonicalIngredientName, isKnownGlass } from "./catalogNames";

describe("canonicalGlass", () => {
  it.each([
    ["Collins Glass", "Collins glass"],
    ["Old-Fashioned glass", "Old-fashioned glass"],
    ["Coupe Glass", "Coupe"],
    ["Whiskey Glass", "Rocks glass"],
    ["Nick and Nora Glass", "Nick and Nora glass"],
    ["  Highball   Glass ", "Highball glass"],
    ["Irish coffee cup", "Irish coffee cup"],
    ["Margarita/Coupette glass", "Margarita/Coupette glass"],
  ])("maps %s to %s", (raw, expected) => {
    expect(canonicalGlass(raw)).toBe(expected);
  });

  it("falls back to sentence case for an unknown glass", () => {
    expect(canonicalGlass("TIKI Mug")).toBe("Tiki mug");
    expect(isKnownGlass("TIKI Mug")).toBe(false);
  });

  it("returns null for empty values", () => {
    expect(canonicalGlass(null)).toBeNull();
    expect(canonicalGlass(undefined)).toBeNull();
    expect(canonicalGlass("   ")).toBeNull();
  });

  it("is stable on its own output", () => {
    for (const value of Object.values(GLASS_MAP)) {
      expect(canonicalGlass(value)).toBe(value);
    }
  });

  it("leaves no two canonical values differing only by case", () => {
    const values = [...new Set(Object.values(GLASS_MAP))];
    const lowered = new Set(values.map((value) => value.toLowerCase()));
    expect(lowered.size).toBe(values.length);
  });
});

describe("canonicalIngredientName", () => {
  it.each([
    ["demerara Sugar", "Demerara Sugar"],
    ["blackstrap rum", "Blackstrap Rum"],
    ["151 proof rum", "151 Proof Rum"],
    ["7-up", "7-Up"],
    ["Soda water", "Soda Water"],
    ["Lemon-lime soda", "Lemon-Lime Soda"],
    ["Creme De Banane", "Creme de Banane"],
    ["half-and-half", "Half-and-Half"],
    ["McClure's Pickles Brine", "McClure's Pickles Brine"],
    ["Añejo rum", "Añejo Rum"],
    ["  Lime   juice ", "Lime Juice"],
  ])("maps %s to %s", (raw, expected) => {
    expect(canonicalIngredientName(raw)).toBe(expected);
  });

  it("is stable on its own output", () => {
    const once = canonicalIngredientName("green creme de menthe");
    expect(canonicalIngredientName(once)).toBe(once);
  });
});
