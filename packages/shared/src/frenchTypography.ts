// French punctuation spacing and quotes for AI written French (spec 0046 AC-1).
// Haiku often types plain spaces, so French catalog text, notes, and drink
// ideas pass through this before they are stored or returned. Pure and
// idempotent: running it twice gives the same text.
// generate-drink-idea (Deno) carries a hand copy; change both together.
// Spec: docs/specs/0046-french-locale.md

const NARROW_NBSP = "\u202F";
const NBSP = "\u00A0";

/**
 * Applies French typography: a narrow no break space before `;` `!` `?`, a no
 * break space before a `:` that follows a letter or a space and ends a clause,
 * and « » quotes with narrow no break spaces inside. Times (`14:30`) and URLs
 * (`?q=`, `https://`) are left alone, since their marks are not followed by a
 * space or the end.
 */
export function normalizeFrenchTypography(text: string): string {
  return (
    text
      // "…" or “…” pairs become « … ».
      .replace(/["“]([^"“”]*?)["”]/g, (_match, inner: string) => `«${inner.trim()}»`)
      .replace(/«[ \u00A0\u202F]*/g, `«${NARROW_NBSP}`)
      .replace(/[ \u00A0\u202F]*»/g, `${NARROW_NBSP}»`)
      // ; ! ? ending a clause (a run like "?!" counts as one mark).
      .replace(/([^\s])[ \u00A0\u202F]*([;!?]+)(?=$|[\s»)\]])/g, `$1${NARROW_NBSP}$2`)
      // : ending a clause, after spaces or straight after a letter.
      .replace(/([^\s])[ \u00A0\u202F]+:(?=$|\s)/g, `$1${NBSP}:`)
      .replace(/(\p{L}):(?=$|\s)/gu, `$1${NBSP}:`)
  );
}
