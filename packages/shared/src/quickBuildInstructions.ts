// Quick Build Mode's condensed "bare minimum" instructions line (spec
// 0023-bartender-mode/0023-quick-build-mode.md, AC-1: "the method as one
// bold line"). Composes each ingredient's already-formatted amount and name,
// the method, the straining, the glass, and the garnish into one
// arrow-joined string, e.g. "1.5 oz Applejack → 1 oz Grapefruit Juice →
// Shake → Double Strain → Coupe → Grapefruit Twist". Pure and side effect
// free per AGENTS.md: it takes display strings the screen has already
// computed (so unit conversion/parts logic stays defined once, in units.ts
// and parts.ts) rather than reformatting amounts itself.
//
// A step is included only when it has a value; ice is deliberately left out
// (it's a prep detail, not a build step a bartender reads off in sequence),
// matching the existing Glass/Ice/Garnish detail lines which stay as their
// own labeled section alongside this line.

export interface QuickBuildInstructionIngredient {
  /** The ingredient's already unit-converted display amount, e.g. "1.5 oz" or "2 dashes". */
  displayAmount: string;
  name: string;
}

export interface QuickBuildInstructionsInput {
  ingredients: readonly QuickBuildInstructionIngredient[];
  method: string | null;
  straining: string | null;
  glass: string | null;
  garnish: string | null;
}

/** Builds the condensed instructions line's steps, in display order. */
export function buildQuickBuildInstructionSteps(input: QuickBuildInstructionsInput): string[] {
  const ingredientSteps = input.ingredients
    .filter((ingredient) => ingredient.displayAmount.trim().length > 0)
    .map((ingredient) => `${ingredient.displayAmount} ${ingredient.name}`);

  const trailingSteps = [input.method, input.straining, input.glass, input.garnish].filter(
    (step): step is string => Boolean(step),
  );

  return [...ingredientSteps, ...trailingSteps];
}

/** Renders the condensed instructions line, or null when there are no steps at all. */
export function formatQuickBuildInstructions(input: QuickBuildInstructionsInput): string | null {
  const steps = buildQuickBuildInstructionSteps(input);
  return steps.length > 0 ? steps.join(" → ") : null;
}
