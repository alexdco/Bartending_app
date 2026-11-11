// Hindi punctuation, units, and Unicode form for AI written Hindi (spec 0048
// AC-1, AC-23). Haiku often ends Hindi sentences with a full stop, writes
// dotted units like मि.ली., and types straight quotes, so Hindi catalog text,
// notes, and drink ideas pass through this before they are stored or
// returned. Pure and idempotent: running it twice gives the same text. It
// runs on AI output only, never on hand written UI strings.
// generate-drink-idea (Deno) carries a hand copy; change both together.
// Spec: docs/specs/0048-hindi-locale/index.md

/** Dotted unit spellings and their dotless forms, as on Indian packaging (AC-13). */
const DOTTED_UNITS: readonly (readonly [RegExp, string])[] = [
  [/मि\.ली\./g, "मिली"],
  [/सें\.ली\./g, "सेली"],
  // A bare ली. only after a number, so a sentence ending in a word like
  // "ली." (took) still gets its danda.
  [/(?<=\d )ली\./g, "ली"],
];

/** Words written with an abbreviation dot that never ends a sentence. */
const ABBREVIATIONS: ReadonlySet<string> = new Set(["डॉ", "श्री", "सं", "पृ"]);

// A single full stop right after a Devanagari character that ends a sentence:
// followed by the end of the text, a newline, a closing quote, or a space and
// another word. A run of dots never matches, since a dot is not Devanagari.
const SENTENCE_FULL_STOP = /(?<=[ऀ-ॿ])\.(?=[ \t]*$|\r?\n|["”’']|[ \t]+\S)/g;

function endsAbbreviation(textBefore: string): boolean {
  const word = /[^\s"“(]+$/.exec(textBefore)?.[0] ?? "";
  return ABBREVIATIONS.has(word);
}

/**
 * Applies Hindi typography, in order: Unicode NFC; dotted units to dotless
 * (`मि.ली.` → `मिली`); no space before `।`; a sentence ending full stop after
 * Devanagari becomes `।`; a pair of straight `"…"` quotes becomes “ … ”.
 * Abbreviations (`डॉ.`), ellipses, `|`, decimals, URLs, Latin text, and an
 * unpaired quote are left alone.
 */
export function normalizeHindiTypography(text: string): string {
  const nfc = text.normalize("NFC");
  const dotless = DOTTED_UNITS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    nfc,
  );
  return dotless
    .replace(SENTENCE_FULL_STOP, (dot: string, offset: number, whole: string) =>
      endsAbbreviation(whole.slice(0, offset)) ? dot : "।",
    )
    .replace(/[ \t]+।/g, "।")
    .replace(/"([^"\n]+)"/g, (_match, inner: string) => `“${inner.trim()}”`);
}
