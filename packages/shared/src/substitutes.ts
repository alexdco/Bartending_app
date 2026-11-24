// Ingredient substitution suggestions (spec 0065). The one place that decides
// which swaps show for an 86'd ingredient (stock filter, alcohol rule,
// locale, allergen and "already in this drink" labels) and how a swap's
// amount reads. Pure: both apps call it for the Quick Build banner and the
// Service menu hint, against whatever service data snapshot they hold
// (live or the offline cache).
// Spec: docs/specs/0065-ingredient-substitution-suggestions/index.md

import { toAllergenList, type Allergen } from "./allergens";
import type { Locale } from "./locale";
import { formatNumber } from "./numberFormat";
import { formatParts } from "./parts";
import {
  CONVERTIBLE_UNITS,
  formatAmountOrRangeInUnit,
  type ConvertibleUnit,
  type RecognizedUnit,
} from "./units";

/** One ranked swap for an 86'd ingredient, as fetch_bar_service_data ships it. */
export interface BarSubstituteItem {
  readonly substituteIngredientId: string;
  /** English name. */
  readonly name: string;
  /** Locale code to translated name (ingredient_translations). */
  readonly nameTranslations: Readonly<Record<string, string>>;
  readonly rank: number;
  readonly ratio: number;
  /** English note; null when the swap has none. */
  readonly note: string | null;
  readonly noteHash: string | null;
  readonly noteTranslations: Readonly<
    Record<string, { readonly note: string; readonly sourceNoteHash: string }>
  >;
  /** The substitute's ingredients.category; null = not classified yet. */
  readonly category: string | null;
  /** Null = allergens not reviewed yet. */
  readonly allergens: readonly Allergen[] | null;
}

/** The swaps for one currently 86'd ingredient at the bar. */
export interface BarIngredientSubstitutes {
  readonly ingredientId: string;
  /** ingredients.substitutes_reviewed_at is not null. */
  readonly reviewed: boolean;
  /** The 86'd ingredient's own allergens; null = not reviewed (counts as none). */
  readonly allergens: readonly Allergen[] | null;
  /** Every rank, ascending. */
  readonly items: readonly BarSubstituteItem[];
}

export type SubstituteOutcome = "shown" | "none_known" | "none_in_stock" | "not_reviewed";

export interface PickedSubstitute {
  readonly substituteIngredientId: string;
  /** Localized name, English fallback. */
  readonly name: string;
  /** Localized note when its translation is current, else English; null when none. */
  readonly note: string | null;
  readonly ratio: number;
  /** Allergens the swap adds over the original, in ALLERGENS order (AC-7). */
  readonly addedAllergens: readonly Allergen[];
  /** The swap's allergens are not reviewed: show "check allergens" (AC-7). */
  readonly allergensUnknown: boolean;
  /** The swap is already an ingredient of the open recipe (AC-8). */
  readonly alreadyInDrink: boolean;
}

export interface PickedSubstitutes {
  readonly outcome: SubstituteOutcome;
  readonly items: readonly PickedSubstitute[];
}

export interface PickSubstitutesInput {
  readonly ingredientId: string;
  readonly substitutes: readonly BarIngredientSubstitutes[];
  /** The same snapshot's stock_86 list. */
  readonly stock86: readonly { readonly ingredientId: string; readonly is86d: boolean }[];
  readonly recipeIngredientIds: readonly string[];
  readonly alcoholFree: boolean;
  readonly locale: Locale;
  /** Defaults to 3 (AC-2). */
  readonly limit?: number;
}

export const SUBSTITUTE_DISPLAY_LIMIT = 3;

/** Categories never offered in an alcohol free recipe; null (unclassified) counts too (AC-6). */
const ALCOHOLIC_CATEGORIES: readonly string[] = ["spirit", "liqueur"];

function isAlcoholicOrUnknown(item: BarSubstituteItem): boolean {
  return item.category === null || ALCOHOLIC_CATEGORIES.includes(item.category);
}

function localizedName(item: BarSubstituteItem, locale: Locale): string {
  return item.nameTranslations[locale] ?? item.name;
}

/** A translation shows only while it was made from the current English note (AC-9). */
function localizedNote(item: BarSubstituteItem, locale: Locale): string | null {
  if (item.note === null) {
    return null;
  }
  const translation = item.noteTranslations[locale];
  return translation !== undefined && translation.sourceNoteHash === item.noteHash
    ? translation.note
    : item.note;
}

function toPicked(
  item: BarSubstituteItem,
  originalAllergens: readonly Allergen[] | null,
  recipeIngredientIds: readonly string[],
  locale: Locale,
): PickedSubstitute {
  const original = originalAllergens ?? [];
  return {
    substituteIngredientId: item.substituteIngredientId,
    name: localizedName(item, locale),
    note: localizedNote(item, locale),
    ratio: item.ratio,
    addedAllergens:
      item.allergens === null
        ? []
        : item.allergens.filter((allergen) => !original.includes(allergen)),
    allergensUnknown: item.allergens === null,
    alreadyInDrink: recipeIngredientIds.includes(item.substituteIngredientId),
  };
}

/**
 * Picks the swaps to show for one 86'd ingredient (AC-2, AC-5, AC-6, AC-7,
 * AC-8, AC-9). Never throws: an ingredient with no entry in the snapshot reads
 * as not reviewed, so the banner shows only its heading.
 */
export function pickSubstitutes(input: PickSubstitutesInput): PickedSubstitutes {
  const entry = input.substitutes.find(
    (candidate) => candidate.ingredientId === input.ingredientId,
  );

  if (entry === undefined || entry.items.length === 0) {
    return { outcome: entry?.reviewed ? "none_known" : "not_reviewed", items: [] };
  }

  const ranked = [...entry.items].sort((a, b) => a.rank - b.rank);
  const allowed = input.alcoholFree ? ranked.filter((item) => !isAlcoholicOrUnknown(item)) : ranked;

  if (allowed.length === 0) {
    return { outcome: "none_known", items: [] };
  }

  const out = new Set(
    input.stock86.filter((stock) => stock.is86d).map((stock) => stock.ingredientId),
  );
  const inStock = allowed.filter((item) => !out.has(item.substituteIngredientId));

  if (inStock.length === 0) {
    return { outcome: "none_in_stock", items: [] };
  }

  return {
    outcome: "shown",
    items: inStock
      .slice(0, input.limit ?? SUBSTITUTE_DISPLAY_LIMIT)
      .map((item) => toPicked(item, entry.allergens, input.recipeIngredientIds, input.locale)),
  };
}

// Amounts -----------------------------------------------------------------------

/** The phrase steps for a swap whose original amount can't be parsed (AC-4). */
export const SUBSTITUTE_RATIO_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1.25, 1.5, 2, 3, 4] as const;
export type SubstituteRatioStep = (typeof SUBSTITUTE_RATIO_STEPS)[number];

/** UI string key per ratio step, shared by both apps' message files. */
export const SUBSTITUTE_RATIO_PHRASE_KEYS = {
  0.25: "quarter",
  0.33: "third",
  0.5: "half",
  0.67: "twoThirds",
  0.75: "threeQuarters",
  1.25: "oneAndQuarter",
  1.5: "oneAndHalf",
  2: "double",
  3: "triple",
  4: "quadruple",
} as const satisfies Readonly<Record<SubstituteRatioStep, string>>;

export type SubstituteRatioPhraseKey = (typeof SUBSTITUTE_RATIO_PHRASE_KEYS)[SubstituteRatioStep];

const RATIO_TOLERANCE = 0.01;

/** Quick Build's display mode: a toggle unit, or parts. */
export type SubstituteAmountMode = ConvertibleUnit | "parts";

export interface FormatSubstituteAmountInput {
  readonly amountValue: number | null;
  readonly amountMaxValue: number | null;
  readonly amountUnit: RecognizedUnit | null;
  /** The original line's computeParts value; null for an unscaled line or outside parts mode. */
  readonly partsValue: number | null;
  readonly ratio: number;
  readonly mode: SubstituteAmountMode;
  readonly locale: Locale;
}

export type SubstituteAmount =
  | {
      readonly kind: "amount";
      /** Formatted number or range, no unit word. */
      readonly text: string;
      /** The unit the number is in ("part" in parts mode); the UI renders its label. */
      readonly unit: RecognizedUnit;
      /** The scaled value (the high end of a range, as batch does), for choosing a plural unit word. */
      readonly count: number;
    }
  | {
      readonly kind: "ratio_phrase";
      readonly key: SubstituteRatioPhraseKey;
      readonly approximate: boolean;
    }
  | { readonly kind: "none" };

function isConvertible(unit: RecognizedUnit): unit is ConvertibleUnit {
  return (CONVERTIBLE_UNITS as readonly string[]).includes(unit);
}

function nearestStep(ratio: number): SubstituteRatioStep {
  return SUBSTITUTE_RATIO_STEPS.reduce((best, step) =>
    Math.abs(step - ratio) < Math.abs(best - ratio) ? step : best,
  );
}

function ratioPhrase(ratio: number): SubstituteAmount {
  if (Math.abs(ratio - 1) <= RATIO_TOLERANCE) {
    return { kind: "none" };
  }
  const step = nearestStep(ratio);
  return {
    kind: "ratio_phrase",
    key: SUBSTITUTE_RATIO_PHRASE_KEYS[step],
    approximate: Math.abs(step - ratio) > RATIO_TOLERANCE,
  };
}

function roundToHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The adjusted amount for a swap (AC-3, AC-4): the original amount times the
 * swap's ratio. oz/ml/cl show in the toggle unit (in parts mode, their own
 * unit when the line has no parts value); parts mode scales the line's parts
 * value; any other unit (dash, tsp, each) scales and keeps its unit; an
 * unparseable amount gives a ratio phrase, or nothing at ratio 1.
 */
export function formatSubstituteAmount(input: FormatSubstituteAmountInput): SubstituteAmount {
  const { amountValue, amountMaxValue, amountUnit, ratio, mode, locale } = input;

  if (mode === "parts" && input.partsValue !== null) {
    const parts = roundToHundredth(input.partsValue * ratio);
    return { kind: "amount", text: formatParts(parts, locale), unit: "part", count: parts };
  }

  if (amountValue === null || amountUnit === null) {
    return ratioPhrase(ratio);
  }

  const low = amountValue * ratio;
  const high = amountMaxValue === null ? null : amountMaxValue * ratio;

  if (isConvertible(amountUnit)) {
    const target = mode === "parts" ? amountUnit : mode;
    const text = formatAmountOrRangeInUnit(low, high, amountUnit, target, locale);
    if (text !== null) {
      return { kind: "amount", text, unit: target, count: high ?? low };
    }
  }

  const lowRounded = roundToHundredth(low);
  const lowText = formatNumber(lowRounded, locale, 2);
  const highText = high === null ? null : formatNumber(roundToHundredth(high), locale, 2);
  return {
    kind: "amount",
    text: highText === null || highText === lowText ? lowText : `${lowText}–${highText}`,
    unit: amountUnit,
    count: high === null ? lowRounded : roundToHundredth(high),
  };
}

// Service data mapping ------------------------------------------------------------

function toStringRecord(raw: unknown): Readonly<Record<string, string>> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function toNoteTranslations(raw: unknown): BarSubstituteItem["noteTranslations"] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(raw).flatMap(([locale, value]) => {
      const row = value as { note?: unknown; source_note_hash?: unknown } | null;
      return row !== null &&
        typeof row.note === "string" &&
        typeof row.source_note_hash === "string"
        ? [[locale, { note: row.note, sourceNoteHash: row.source_note_hash }]]
        : [];
    }),
  );
}

function toNullableString(raw: unknown): string | null {
  return typeof raw === "string" ? raw : null;
}

function mapSubstituteItem(raw: Record<string, unknown>): BarSubstituteItem {
  return {
    substituteIngredientId: String(raw.substitute_ingredient_id),
    name: String(raw.name),
    nameTranslations: toStringRecord(raw.name_translations),
    rank: Number(raw.rank),
    ratio: Number(raw.ratio),
    note: toNullableString(raw.note),
    noteHash: toNullableString(raw.note_hash),
    noteTranslations: toNoteTranslations(raw.note_translations),
    category: toNullableString(raw.category),
    allergens: toAllergenList(raw.allergens),
  };
}

/** Maps fetch_bar_service_data's `substitutes` column; anything malformed maps to []. */
export function mapBarSubstitutes(raw: unknown): BarIngredientSubstitutes[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((row: Record<string, unknown>) => ({
    ingredientId: String(row.ingredient_id),
    reviewed: row.reviewed === true,
    allergens: toAllergenList(row.allergens),
    items: Array.isArray(row.items) ? row.items.map(mapSubstituteItem) : [],
  }));
}

// Banner and menu hint ------------------------------------------------------------

export interface SubstituteRecipeIngredient {
  readonly ingredientId: string;
  /** The name Quick Build already shows for this line (AC-1 heading). */
  readonly name: string;
  readonly isStaple: boolean;
}

export interface SubstituteServiceSnapshot {
  readonly stock86: PickSubstitutesInput["stock86"];
  readonly substitutes: readonly BarIngredientSubstitutes[];
}

export interface SubstituteBannerBlock {
  readonly ingredientId: string;
  readonly name: string;
  /** Index of the ingredient's first line in the recipe, for its amount and parts value. */
  readonly lineIndex: number;
  readonly picked: PickedSubstitutes;
}

export interface SubstituteBannerInput {
  readonly ingredients: readonly SubstituteRecipeIngredient[];
  readonly serviceData: SubstituteServiceSnapshot;
  readonly alcoholFree: boolean;
  readonly locale: Locale;
}

/**
 * One block per distinct non staple 86'd ingredient, in recipe order (AC-1),
 * each with its picked swaps. Empty when nothing in the recipe is 86'd.
 */
export function buildSubstituteBanner(input: SubstituteBannerInput): SubstituteBannerBlock[] {
  const out = new Set(
    input.serviceData.stock86.filter((stock) => stock.is86d).map((stock) => stock.ingredientId),
  );
  const recipeIngredientIds = input.ingredients.map((ingredient) => ingredient.ingredientId);

  return input.ingredients.flatMap((ingredient, lineIndex) =>
    ingredient.isStaple ||
    !out.has(ingredient.ingredientId) ||
    recipeIngredientIds.indexOf(ingredient.ingredientId) !== lineIndex
      ? []
      : [
          {
            ingredientId: ingredient.ingredientId,
            name: ingredient.name,
            lineIndex,
            picked: pickSubstitutes({
              ingredientId: ingredient.ingredientId,
              substitutes: input.serviceData.substitutes,
              stock86: input.serviceData.stock86,
              recipeIngredientIds,
              alcoholFree: input.alcoholFree,
              locale: input.locale,
            }),
          },
        ],
  );
}

/**
 * The Service menu's "swap available" hint (AC-11): at least one of the
 * recipe's 86'd ingredients has a swap the banner would list.
 */
export function hasSubstituteAvailable(input: Omit<SubstituteBannerInput, "locale">): boolean {
  return buildSubstituteBanner({ ...input, locale: "en" }).some(
    (block) => block.picked.outcome === "shown",
  );
}

export interface SubstituteHouseRecipe {
  readonly alcoholFree: boolean;
  readonly ingredients: readonly { readonly ingredientId: string; readonly name: string }[];
}

/**
 * AC-11 for a Service menu item. House recipe lines carry no staple flag and
 * the menu's 86'd warning counts every line, so every line is checked here.
 */
export function houseRecipeHasSubstitute(
  recipe: SubstituteHouseRecipe,
  serviceData: SubstituteServiceSnapshot,
): boolean {
  return hasSubstituteAvailable({
    ingredients: recipe.ingredients.map((ingredient) => ({
      ingredientId: ingredient.ingredientId,
      name: ingredient.name,
      isStaple: false,
    })),
    serviceData,
    alcoholFree: recipe.alcoholFree,
  });
}
