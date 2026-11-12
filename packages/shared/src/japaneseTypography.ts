// Japanese punctuation, digits, and kana width for AI written Japanese (spec
// 0050 AC-1, AC-22). Haiku sometimes ends Japanese sentences with a full
// stop, types ASCII commas and quotes, or echoes half width katakana and full
// width digits, so Japanese catalog text, notes, and drink ideas pass through
// this before they are stored or returned. Pure and idempotent: running it
// twice gives the same text. It runs on AI output only, never on hand written
// UI strings.
// generate-drink-idea (Deno) carries a hand copy; change both together.
// Spec: docs/specs/0050-japanese-locale/index.md

/** Hiragana, katakana (ー included), 々, and the CJK ideograph blocks. */
const JAPANESE = "\\u3005\\u3040-\\u30FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF";

/** Japanese characters plus Japanese punctuation (。、「」 and full width ！？). */
const JAPANESE_OR_PUNCTUATION = `${JAPANESE}\\u3001-\\u303F\\uFF01\\uFF1F`;

const HAS_JAPANESE = new RegExp(`[${JAPANESE}]`);

// A full stop that ends a sentence: after a Japanese character, a closing 」,
// or an ASCII digit, letter, %, or ), and followed by the end of the text, a
// newline, or a Japanese character (directly or after spaces). A dot between
// two digits never matches, since a digit is not a follower.
const SENTENCE_FULL_STOP = new RegExp(
  `(?<=[${JAPANESE}\\u300DA-Za-z0-9%)])\\.(?=$|\\r?\\n|[ \\t]*[${JAPANESE}])`,
  "g",
);

const JAPANESE_BEFORE_ASCII_DOT = new RegExp(`[${JAPANESE}\\u300D]`);

/** The line around `offset`, so a Latin only line keeps its full stops. */
function lineAt(text: string, offset: number): string {
  const start = text.lastIndexOf("\n", offset - 1) + 1;
  const end = text.indexOf("\n", offset);
  return text.slice(start, end === -1 ? undefined : end);
}

/**
 * Applies Japanese typography, in order: Unicode NFC; half width katakana to
 * full width (`ｼﾞﾝ` → `ジン`); full width digits to ASCII (`１５` → `15`); a
 * sentence ending `.` becomes `。` (after a Latin character only when its
 * line holds Japanese); `,` `!` `?` after a Japanese character become `、`
 * `！` `？`; spaces between Japanese characters go; a straight `"…"` pair
 * around Japanese becomes `「…」`. Decimals, `30ml`, URLs, `B-52`,
 * parentheses, colons, and Latin only text are left alone.
 */
export function normalizeJapaneseTypography(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[｡-ﾟ]+/g, (run) => run.normalize("NFKC"))
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(SENTENCE_FULL_STOP, (dot: string, offset: number, whole: string) =>
      JAPANESE_BEFORE_ASCII_DOT.test(whole.charAt(offset - 1)) ||
      HAS_JAPANESE.test(lineAt(whole, offset))
        ? "。"
        : dot,
    )
    .replace(new RegExp(`(?<=[${JAPANESE}]),`, "g"), "、")
    .replace(new RegExp(`(?<=[${JAPANESE}])!`, "g"), "！")
    .replace(new RegExp(`(?<=[${JAPANESE}])\\?`, "g"), "？")
    .replace(
      new RegExp(`(?<=[${JAPANESE_OR_PUNCTUATION}]) +(?=[${JAPANESE_OR_PUNCTUATION}])`, "g"),
      "",
    )
    .replace(/"([^"\n]+)"/g, (pair: string, inner: string) =>
      HAS_JAPANESE.test(inner) ? `「${inner.trim()}」` : pair,
    );
}
