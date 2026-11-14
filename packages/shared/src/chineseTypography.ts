// Mainland punctuation, quotes, digits, and spacing for AI written Simplified
// Chinese (spec 0052 AC-1, AC-22). Haiku sometimes ends Chinese sentences with
// an ASCII full stop, types ASCII commas and straight or Japanese quotes,
// echoes full width digits, or glues Chinese to Latin letters and numbers, so
// Chinese catalog text, notes, and drink ideas pass through this before they
// are stored or returned. Name fields also go through normalizeChineseName,
// so a middle dot never hides a drink name from search (spec 0052 AC-14).
// Pure and idempotent: running either twice gives the same text. They run on
// AI output only, never on hand written UI strings. Neither converts
// Traditional characters or removes kana; chineseScript.ts finds those.
// generate-drink-idea (Deno) carries hand copies; change both together.
// Spec: docs/specs/0052-simplified-chinese-locale/index.md

/** Han: CJK Unified, Extension A, and Compatibility ideographs. */
const HAN = "\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF";

const HAS_HAN = new RegExp(`[${HAN}]`);

const HAN_OR_CLOSING_QUOTE = new RegExp(`[${HAN}\\u201D]`);

/** The full width forms of the ASCII marks rule 6 converts. */
const FULL_WIDTH_MARK: Readonly<Record<string, string>> = {
  ",": "，",
  "?": "？",
  "!": "！",
  ":": "：",
  ";": "；",
};

// A full stop that ends a sentence: after a Han character, a closing ”, or an
// ASCII letter, digit, %, or ), and followed by the end of the text, a
// newline, or a Han character (directly or after spaces). A dot between two
// digits never matches, since a digit is not a follower.
const SENTENCE_FULL_STOP = new RegExp(
  `(?<=[${HAN}\\u201DA-Za-z0-9%)])\\.(?=$|\\r?\\n|[ \\t]*[${HAN}])`,
  "g",
);

// An ASCII mark after a Latin letter, digit, %, or bracket (spaces allowed
// between), followed by Han, the end of the text, or a newline. `1:1` and
// URLs never match, since a digit or letter follows.
const MARK_AFTER_LATIN = new RegExp(
  `(?<=[A-Za-z0-9%)\\uFF09][ \\t]*)[,?!:;](?=[ \\t]*(?:[${HAN}]|$|\\r?\\n))`,
  "g",
);

/** Where a Han character touches an ASCII letter or digit, in either order. */
const HAN_LATIN_SEAM = new RegExp(`(?<=[${HAN}])(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])(?=[${HAN}])`, "g");

/** The middle dots a name may carry between words: · ・ ･ • ‧ ∙. */
const NAME_DOT = /[ \t]*[·・･•‧∙][ \t]*/g;

/** The line around `offset`, so a Latin only line keeps its ASCII marks. */
function lineAt(text: string, offset: number): string {
  const start = text.lastIndexOf("\n", offset - 1) + 1;
  const end = text.indexOf("\n", offset);
  return text.slice(start, end === -1 ? undefined : end);
}

/**
 * Applies mainland Chinese typography, in order:
 * 1. Unicode NFC.
 * 2. Full width digits and Latin letters to half width (`１５` → `15`), and the
 *    ideographic space to a space.
 * 3. `「` `『` and `」` `』` to `“` and `”`.
 * 4. A straight `"…"` pair around Han becomes `“…”`.
 * 5. A sentence ending `.` becomes `。` (after a Latin character only when its
 *    line holds Han).
 * 6. `,` `?` `!` `:` `;` become `，` `？` `！` `：` `；` after Han or `”`, or
 *    after a Latin character when the line holds Han and Han or a line end
 *    follows.
 * 7. Spaces around full width punctuation go, and spaces between two Han
 *    characters go.
 * 8. One space goes between a Han character and an ASCII letter or digit.
 * Decimals, `30ml`, `1:1`, URLs, `B-52`, parentheses of either width, middle
 * dots, and Latin only text are left alone.
 */
export function normalizeChineseTypography(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .replace(/[「『]/g, "“")
    .replace(/[」』]/g, "”")
    .replace(/"([^"\n]+)"/g, (pair: string, inner: string) =>
      HAS_HAN.test(inner) ? `“${inner.trim()}”` : pair,
    )
    .replace(SENTENCE_FULL_STOP, (dot: string, offset: number, whole: string) =>
      HAN_OR_CLOSING_QUOTE.test(whole.charAt(offset - 1)) || HAS_HAN.test(lineAt(whole, offset))
        ? "。"
        : dot,
    )
    .replace(
      new RegExp(`(?<=[${HAN}\\u201D])[,?!:;]`, "g"),
      (mark: string) => FULL_WIDTH_MARK[mark] ?? mark,
    )
    .replace(MARK_AFTER_LATIN, (mark: string, offset: number, whole: string) =>
      HAS_HAN.test(lineAt(whole, offset)) ? (FULL_WIDTH_MARK[mark] ?? mark) : mark,
    )
    .replace(/[ \t]+(?=[，。？！：；、])/g, "")
    .replace(/(?<=[，。？！：；、])[ \t]+/g, "")
    .replace(new RegExp(`(?<=[${HAN}]) +(?=[${HAN}])`, "g"), "")
    .replace(HAN_LATIN_SEAM, " ");
}

/**
 * Chinese typography for a name field, then a middle dot (with any spaces
 * around it) next to a Han character is removed (`汤姆·柯林斯` → `汤姆柯林斯`,
 * `金·Tonic` → `金 Tonic`, `B·52` unchanged), then the Han to Latin space rule
 * runs again and the ends are trimmed.
 */
export function normalizeChineseName(text: string): string {
  return normalizeChineseTypography(text)
    .replace(NAME_DOT, (dot: string, offset: number, whole: string) =>
      HAS_HAN.test(whole.charAt(offset - 1)) || HAS_HAN.test(whole.charAt(offset + dot.length))
        ? ""
        : dot,
    )
    .replace(HAN_LATIN_SEAM, " ")
    .trim();
}
