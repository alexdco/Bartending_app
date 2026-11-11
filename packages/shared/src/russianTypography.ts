// Russian quotes and dashes for AI written Russian (spec 0047 AC-1).
// Haiku often types straight quotes and a hyphen for a dash, so Russian catalog
// text, notes, and drink ideas pass through this before they are stored or
// returned. Pure and idempotent: running it twice gives the same text. It runs
// on AI output only, never on hand written UI strings.
// generate-drink-idea (Deno) carries a hand copy; change both together.
// Spec: docs/specs/0047-russian-locale.md

const NBSP = " ";

/** Splits on «…» spans, keeping them as the odd entries. */
const GUILLEMET_SPAN = /(«[^»]*»)/;

function typesetOutsideQuotes(segment: string): string {
  return (
    segment
      // A straight quote pair on one line becomes « ».
      .replace(/"([^"\n]+)"/g, (_match, inner: string) => `«${inner.trim()}»`)
      // A spaced hyphen or dash becomes a no break space, an em dash, and a space.
      .replace(/[  ]+[-–—][  ]+/g, `${NBSP}— `)
  );
}

/**
 * Applies Russian typography: a pair of straight `"…"` quotes becomes « … »,
 * and a hyphen or en dash with spaces on both sides becomes a no break space,
 * an em dash, and a space. Hyphens inside words, ranges like `2-3`, URLs, a
 * lone apostrophe, an unpaired quote, and text inside « » are left alone.
 */
export function normalizeRussianTypography(text: string): string {
  return text
    .split(GUILLEMET_SPAN)
    .map((segment, index) => (index % 2 === 1 ? segment : typesetOutsideQuotes(segment)))
    .join("");
}
