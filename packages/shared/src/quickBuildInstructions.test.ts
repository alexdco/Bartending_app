import { describe, expect, it } from "vitest";
import {
  buildQuickBuildInstructionSteps,
  formatQuickBuildInstructions,
} from "./quickBuildInstructions";

describe("formatQuickBuildInstructions", () => {
  it("joins ingredients, method, straining, glass, and garnish into one arrow-joined line", () => {
    const result = formatQuickBuildInstructions({
      ingredients: [
        { displayAmount: "1.5 oz", name: "Applejack" },
        { displayAmount: "1 oz", name: "Grapefruit Juice" },
      ],
      method: "Shake",
      straining: "Double Strain",
      glass: "Coupe",
      garnish: "Grapefruit Twist",
    });

    expect(result).toBe(
      "1.5 oz Applejack → 1 oz Grapefruit Juice → Shake → Double Strain → Coupe → Grapefruit Twist",
    );
  });

  it("omits steps with no value rather than rendering a blank arrow segment", () => {
    const result = formatQuickBuildInstructions({
      ingredients: [{ displayAmount: "2 oz", name: "Gin" }],
      method: "Stir",
      straining: null,
      glass: "Rocks",
      garnish: null,
    });

    expect(result).toBe("2 oz Gin → Stir → Rocks");
  });

  it("skips an ingredient with no displayable amount", () => {
    const steps = buildQuickBuildInstructionSteps({
      ingredients: [
        { displayAmount: "", name: "Bitters" },
        { displayAmount: "2 oz", name: "Whiskey" },
      ],
      method: null,
      straining: null,
      glass: null,
      garnish: null,
    });

    expect(steps).toEqual(["2 oz Whiskey"]);
  });

  it("returns null when there are no ingredients and no method/straining/glass/garnish", () => {
    const result = formatQuickBuildInstructions({
      ingredients: [],
      method: null,
      straining: null,
      glass: null,
      garnish: null,
    });

    expect(result).toBeNull();
  });
});
