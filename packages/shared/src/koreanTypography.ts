// Korean width, punctuation, and quotes for AI written Korean (spec 0051
// AC-1, AC-22). Haiku sometimes echoes full width digits, Japanese 。 and 、,
// corner brackets, or a space before a full stop in Korean, so Korean catalog
// text, notes, and drink ideas pass through this before they are stored or
// returned. Name fields also go through normalizeKoreanName, so a middle dot
// never hides a drink name from search (spec 0051 AC-3, AC-14). Pure and
// idempotent: running either twice gives the same text. They run on AI
// output only, never on hand written UI strings.
// generate-drink-idea (Deno) carries hand copies; change both together.
// Spec: docs/specs/0051-korean-locale/index.md

/** Hangul syllables (가 to 힣). */
const HANGUL = "\\uAC00-\\uD7A3";

const HAS_HANGUL = new RegExp(`[${HANGUL}]`);

/** The middle dots a name may carry between words: · ・ ･ • ‧ ∙. */
const NAME_DOT = /[ \t]*[\u00B7\u30FB\uFF65\u2022\u2027\u2219][ \t]*/g;

/**
 * Applies Korean typography, in order: Unicode NFC; full width ASCII to half
 * width (`１５` → `15`) and the ideographic space to a space; `。` `、` to
 * `.` `,`; `「` `『` and `」` `』` to `“` and `”`; spaces before a `.` `,`
 * `?` `!` that follows Hangul go; a straight `"…"` pair around Hangul becomes
 * `“…”`. Decimals, `30ml`, URLs, `B-52`, parentheses, colons, middle dots
 * (a list separator in Korean prose), `ㅋㅋ`, and Latin only text are left
 * alone.
 */
export function normalizeKoreanTypography(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ")
    .replace(/。/g, ".")
    .replace(/、/g, ",")
    .replace(/[「『]/g, "“")
    .replace(/[」』]/g, "”")
    .replace(new RegExp(`(?<=[${HANGUL}])[ \\t]+(?=[.,?!])`, "g"), "")
    .replace(/"([^"\n]+)"/g, (pair: string, inner: string) =>
      HAS_HANGUL.test(inner) ? `“${inner.trim()}”` : pair,
    );
}

/**
 * Korean typography for a name field, then a middle dot (with any spaces
 * around it) next to a Hangul syllable becomes one space (`진·토닉` → `진 토닉`,
 * `진·Tonic` → `진 Tonic`, `B·52` unchanged), then the ends are trimmed.
 */
export function normalizeKoreanName(text: string): string {
  return normalizeKoreanTypography(text)
    .replace(NAME_DOT, (dot: string, offset: number, whole: string) =>
      HAS_HANGUL.test(whole.charAt(offset - 1)) ||
      HAS_HANGUL.test(whole.charAt(offset + dot.length))
        ? " "
        : dot,
    )
    .trim();
}
