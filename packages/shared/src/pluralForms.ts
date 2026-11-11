// The plural forms each locale needs in its message files (spec 0047 AC-11).
// Web ICU `plural` blocks and mobile `*_<form>` key families are both checked
// against this, so a locale like Russian (one, few, many, other) can't ship a
// count message that is missing a form.
// Spec: docs/specs/0047-russian-locale/index.md

import type { Locale } from "./locale";

/** Counts up to this cover every whole number form in CLDR's rules. */
const HIGHEST_COUNT_CHECKED = 1000;

/**
 * The plural forms a locale reaches for the whole numbers 0 to 1000, plus
 * `other`, in CLDR order. Forms reached only by fractions or by millions
 * (Spanish and French `many`) are left out, since messages never show them.
 */
export function requiredPluralForms(
  locale: Locale,
  type: Intl.PluralRuleType = "cardinal",
): readonly Intl.LDMLPluralRule[] {
  const rules = new Intl.PluralRules(locale, { type });
  const reached = new Set(
    Array.from({ length: HIGHEST_COUNT_CHECKED + 1 }, (_, count) => rules.select(count)),
  );
  return rules
    .resolvedOptions()
    .pluralCategories.filter((form) => form === "other" || reached.has(form));
}
