// generate-drink-idea: turns a caller's pantry into a novel, AI generated drink idea.
// Spec: docs/specs/0007-ai-generated-pantry-drink-ideas.md
// Limits: docs/specs/0034-ai-quota-abuse-hardening/index.md
//
// - Never accepts a pantry ingredient list from the caller; always resolves the
//   caller's own pantry server side via auth.uid() (0007 AC-8).
// - The per user (tiered), per IP (guests only), and global daily limits are
//   checked and claimed in one database transaction before the Claude call, so
//   concurrent requests cannot push any counter past its limit (0034 AC-1 to AC-4).
// - A generation that still fails after its retry gives its slots back (0034 AC-4b).
// - One automatic retry on timeout, schema/pantry mismatch, or a 5xx from
//   Anthropic; never on a 4xx (0007 AC-7).
import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.124.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.124.0/helpers/zod";
// The SDK zod helper needs the zod v4 API; plain `npm:zod@3` crashes it at runtime.
import { z } from "npm:zod@3.25.76/v4";
import * as Sentry from "npm:@sentry/deno@10";
import { clientIpFromHeaders, hashIpBucket, ipBucket } from "../_shared/ip-bucket.ts";

const MIN_PANTRY_INGREDIENTS = 2;
const ANON_DAILY_QUOTA = 5;
const LINKED_DAILY_QUOTA = 10;
const ANON_IP_DAILY_QUOTA = 20;
const GLOBAL_DAILY_CAP = 2000;
const ANON_GLOBAL_DAILY_CAP = 1600;
const ANTHROPIC_TIMEOUT_MS = 15_000;

const sentryDsn = Deno.env.get("SENTRY_DSN");
if (sentryDsn) {
  Sentry.init({ dsn: sentryDsn });
}

function reportError(error: unknown, context: Record<string, unknown>) {
  console.error(error, context);
  if (sentryDsn) {
    Sentry.captureException(error, { extra: context });
  }
}

function reportWarning(message: string, context: Record<string, unknown>) {
  console.warn(message, context);
  if (sentryDsn) {
    Sentry.captureMessage(message, { level: "warning", extra: context });
  }
}

type LimitReason = "user_limit" | "ip_limit" | "global_limit";

type Reservation = {
  readonly reason: LimitReason | null;
  readonly day: string;
  readonly total_count: number;
};

// Only the first 8 hex characters of an IP hash ever reach logs or Sentry.
function hashPrefix(ipHash: string | null): string | null {
  return ipHash === null ? null : ipHash.slice(0, 8);
}

// Guests only: the HMAC of the caller's IP bucket, from the edge set header.
async function guestIpHash(headers: Headers, secret: string, userId: string): Promise<string> {
  const clientIp = clientIpFromHeaders(headers);
  if (clientIp === null) {
    reportWarning("AI quota: client IP unknown, counting in the shared unknown bucket", {
      userId,
      stage: "ip_bucket",
    });
  }
  return hashIpBucket(ipBucket(clientIp), secret);
}

const SUPPORTED_LOCALES = ["en", "es", "pt", "fr", "ru", "hi", "ja", "ko", "zh"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];
const DEFAULT_LOCALE: Locale = "en";

const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Spanish",
  pt: "Brazilian Portuguese",
  fr: "French as written in France",
  ru: "Russian",
  hi: "Hindi",
  ja: "Japanese",
  ko: "Korean",
  zh: "Simplified Chinese",
};

// Hand copy of LOCALE_AI_TERMS.fr in packages/shared/src/locale.ts (this Deno
// function can't import packages/shared); change both in the same commit.
const FRENCH_INSTRUCTION =
  'Lime is "citron vert" and lemon is "citron jaune"; never write "citron" alone for lime. ' +
  "Use French typography: a narrow no break space before ; ! ? and a no break space " +
  "before :, and « » quotes. ";

// Hand copy of normalizeFrenchTypography in packages/shared/src/frenchTypography.ts
// (spec 0046 AC-12); change both in the same commit.
function normalizeFrenchTypography(text: string): string {
  return text
    .replace(/["“]([^"“”]*?)["”]/g, (_match, inner: string) => `«${inner.trim()}»`)
    .replace(/«[ \u00A0\u202F]*/g, "«\u202F")
    .replace(/[ \u00A0\u202F]*»/g, "\u202F»")
    .replace(/([^\s])[ \u00A0\u202F]*([;!?]+)(?=$|[\s»)\]])/g, "$1\u202F$2")
    .replace(/([^\s])[ \u00A0\u202F]+:(?=$|\s)/g, "$1\u00A0:")
    .replace(/(\p{L}):(?=$|\s)/gu, "$1\u00A0:");
}

// Hand copy of LOCALE_AI_TERMS.ru in packages/shared/src/locale.ts (spec 0047
// AC-17); change both in the same commit.
const RUSSIAN_INSTRUCTION =
  "Address the reader with lowercase \u00AB\u0432\u044B\u00BB. Lime is \u00AB\u043B\u0430\u0439\u043C\u00BB and lemon is \u00AB\u043B\u0438\u043C\u043E\u043D\u00BB. " +
  // Lime juice «сок лайма», wedge or wheel «долька лайма» or «кружок лайма», never «лимонный».
  "Lime juice is \u00AB\u0441\u043E\u043A \u043B\u0430\u0439\u043C\u0430\u00BB and a lime wedge or wheel is \u00AB\u0434\u043E\u043B\u044C\u043A\u0430 \u043B\u0430\u0439\u043C\u0430\u00BB or \u00AB\u043A\u0440\u0443\u0436\u043E\u043A \u043B\u0430\u0439\u043C\u0430\u00BB; never use \u00AB\u043B\u0438\u043C\u043E\u043D\u043D\u044B\u0439\u00BB for lime. " +
  "Use \u00AB \u00BB quotes and a spaced em dash. ";

// Hand copy of normalizeRussianTypography in packages/shared/src/russianTypography.ts
// (spec 0047 AC-17); change both in the same commit.
function normalizeRussianTypography(text: string): string {
  return text
    .split(/(\u00AB[^\u00BB]*\u00BB)/)
    .map((segment, index) =>
      index % 2 === 1
        ? segment
        : segment
            .replace(/"([^"\n]+)"/g, (_match, inner: string) => `\u00AB${inner.trim()}\u00BB`)
            .replace(/[ \u00A0]+[-\u2013\u2014][ \u00A0]+/g, "\u00A0\u2014 "),
    )
    .join("");
}

// Hand copy of LOCALE_AI_TERMS.hi in packages/shared/src/locale.ts (spec 0048
// AC-17); change both in the same commit.
// Everyday Hindi with «आप», lime «हरा नींबू», lemon «पीला नींबू» (inflected as needed),
// never «नींबू» alone, ice «बर्फ़», no Latin letters inside a Hindi word.
const HINDI_INSTRUCTION =
  "Write everyday Hindi in Devanagari and address the reader as \u00AB\u0906\u092A\u00BB. Never mix Latin letters into a Hindi word. " +
  "Lime is \u00AB\u0939\u0930\u093E \u0928\u0940\u0902\u092C\u0942\u00BB and lemon is \u00AB\u092A\u0940\u0932\u093E \u0928\u0940\u0902\u092C\u0942\u00BB, inflected as grammar needs (\u0939\u0930\u0947, \u0939\u0930\u0940, \u092A\u0940\u0932\u0947, \u092A\u0940\u0932\u0940); never write \u00AB\u0928\u0940\u0902\u092C\u0942\u00BB alone. " +
  "Lemonade is \u00AB\u092A\u0940\u0932\u0947 \u0928\u0940\u0902\u092C\u0942 \u0915\u093E \u0936\u0930\u092C\u0924\u00BB and lemon-lime soda is \u00AB\u092A\u0940\u0932\u0947 \u0914\u0930 \u0939\u0930\u0947 \u0928\u0940\u0902\u092C\u0942 \u0935\u093E\u0932\u093E \u0938\u094B\u0921\u093E\u00BB, never \u00AB\u0928\u0940\u0902\u092C\u0942 \u092A\u093E\u0928\u0940\u00BB. " +
  // Grapefruit \u00AB\u091A\u0915\u094B\u0924\u0930\u093E\u00BB, never \u00AB\u0905\u0902\u0917\u0942\u0930\u00BB (grape); cranberry \u00AB\u0915\u094D\u0930\u0948\u0928\u092C\u0947\u0930\u0940\u00BB, never \u00AB\u0915\u0930\u0902\u091F\u00BB.
  "Grapefruit is \u00AB\u091A\u0915\u094B\u0924\u0930\u093E\u00BB (\u091A\u0915\u094B\u0924\u0930\u0947 as grammar needs), never \u00AB\u0905\u0902\u0917\u0942\u0930\u00BB, which means grape. " +
  "Cranberry is \u00AB\u0915\u094D\u0930\u0948\u0928\u092C\u0947\u0930\u0940\u00BB, never \u00AB\u0915\u0930\u0902\u091F\u00BB. " +
  // Phrased so ice is wording only: a bare ice sentence made Haiku list ice as an
  // ingredient in about half of runs, which fails the pantry check (0007 AC-8).
  "When a step mentions ice, write \u00AB\u092C\u0930\u094D\u092B\u093C\u00BB; ice is never an ingredient unless the list above names it. " +
  "Keep bar tool and glass names as Devanagari loanwords. " +
  "Write units without dots and end sentences with \u00AB\u0964\u00BB. ";

// Hand copy of normalizeHindiTypography in packages/shared/src/hindiTypography.ts
// (spec 0048 AC-17, AC-23); change both in the same commit.
function normalizeHindiTypography(text: string): string {
  const abbreviations = [
    "\u0921\u0949",
    "\u0936\u094D\u0930\u0940",
    "\u0938\u0902",
    "\u092A\u0943",
  ];
  return text
    .normalize("NFC")
    .replace(/[\u0966-\u096F]/g, (digit) => String(digit.charCodeAt(0) - 0x0966))
    .replace(/\u092E\u093F\.\u0932\u0940\./g, "\u092E\u093F\u0932\u0940")
    .replace(/\u0938\u0947\u0902\.\u0932\u0940\./g, "\u0938\u0947\u0932\u0940")
    .replace(/(?<=\d )\u0932\u0940\./g, "\u0932\u0940")
    .replace(
      /(?<=[\u0900-\u097F])\.(?=[ \t]*$|\r?\n|["\u201D\u2019']|[ \t]+\S)/g,
      (dot, offset, whole) =>
        abbreviations.includes(/[^\s"\u201C(]+$/.exec(whole.slice(0, offset))?.[0] ?? "")
          ? dot
          : "\u0964",
    )
    .replace(/[ \t]+\u0964/g, "\u0964")
    .replace(/"([^"\n]+)"/g, (_match, inner: string) => `\u201C${inner.trim()}\u201D`);
}

// Hand copy of LOCALE_AI_TERMS.ja in packages/shared/src/locale.ts (spec 0050
// AC-18); change both in the same commit.
// Polite \u3067\u3059\u30FB\u307E\u3059 Japanese, lime \u00AB\u30E9\u30A4\u30E0\u00BB, lemon \u00AB\u30EC\u30E2\u30F3\u00BB, katakana cocktail names
// with \u00AB\u30FB\u00BB, half width digits, \u00AB\u3002\u00BB \u00AB\u3001\u00BB and \u00AB\u300C\u300D\u00BB.
const JAPANESE_INSTRUCTION =
  "Write natural Japanese in the \u3067\u3059\u30FB\u307E\u3059 polite form. " +
  "Lime is \u00AB\u30E9\u30A4\u30E0\u00BB and lemon is \u00AB\u30EC\u30E2\u30F3\u00BB. " +
  "Write cocktail names in katakana with \u00AB\u30FB\u00BB between words. " +
  "Use half width digits, \u00AB\u3002\u00BB and \u00AB\u3001\u00BB, and \u00AB\u300C\u300D\u00BB for quotes. ";

// Hand copy of normalizeJapaneseTypography in packages/shared/src/japaneseTypography.ts
// (spec 0050 AC-18, AC-22); change both in the same commit. Self contained,
// since locale.test.ts extracts and runs it.
function normalizeJapaneseTypography(text: string): string {
  const japanese = "\\u3005\\u3040-\\u30FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF";
  const punctuated = `${japanese}\\u3001-\\u303F\\uFF01\\uFF1F`;
  const hasJapanese = new RegExp(`[${japanese}]`);
  const japaneseBeforeDot = new RegExp(`[${japanese}\\u300D]`);
  return text
    .normalize("NFC")
    .replace(/[\uFF61-\uFF9F]+/g, (run) => run.normalize("NFKC"))
    .replace(/[\uFF10-\uFF19]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(
      new RegExp(`(?<=[${japanese}\\u300DA-Za-z0-9%)])\\.(?=$|\\r?\\n|[ \\t]*[${japanese}])`, "g"),
      (dot, offset, whole) => {
        const start = whole.lastIndexOf("\n", offset - 1) + 1;
        const end = whole.indexOf("\n", offset);
        return japaneseBeforeDot.test(whole.charAt(offset - 1)) ||
          hasJapanese.test(whole.slice(start, end === -1 ? undefined : end))
          ? "\u3002"
          : dot;
      },
    )
    .replace(new RegExp(`(?<=[${japanese}]),`, "g"), "\u3001")
    .replace(new RegExp(`(?<=[${japanese}])!`, "g"), "\uFF01")
    .replace(new RegExp(`(?<=[${japanese}])\\?`, "g"), "\uFF1F")
    .replace(new RegExp(`(?<=[${punctuated}]) +(?=[${punctuated}])`, "g"), "")
    .replace(/"([^"\n]+)"/g, (pair, inner) =>
      hasJapanese.test(inner) ? `\u300C${inner.trim()}\u300D` : pair,
    );
}

// Hand copy of LOCALE_AI_TERMS.ko in packages/shared/src/locale.ts (spec 0051
// AC-17); change both in the same commit.
// Polite \uD574\uC694\uCCB4 Korean with no Hanja, lime \u00AB\uB77C\uC784\u00BB, lemon \u00AB\uB808\uBAAC\u00BB, Hangul cocktail names
// with no middle dot, bar tools \u00AB\uC170\uC774\uCEE4\u00BB \u00AB\uC2A4\uD2B8\uB808\uC774\uB108\u00BB \u00AB\uBA38\uB4E4\uB7EC\u00BB \u00AB\uC9C0\uAC70\u00BB \u00AB\uBC14 \uC2A4\uD47C\u00BB, half width
// digits, Western punctuation, \u00AB\u201C \u201D\u00BB quotes.
const KOREAN_INSTRUCTION =
  "Write natural Korean in the \uD574\uC694\uCCB4 polite form, ending every sentence in -\uC694 (\uB123\uC5B4\uC694, \uBD80\uC5B4\uC694) and never in \uD569\uB2C8\uB2E4\uCCB4 (\uB123\uC2B5\uB2C8\uB2E4, \uBD93\uC2B5\uB2C8\uB2E4), with no Hanja. " +
  "Lime is \u00AB\uB77C\uC784\u00BB and lemon is \u00AB\uB808\uBAAC\u00BB; keep lemon and lime distinct. " +
  "Lemon-lime soda is \u00AB\uB808\uBAAC \uB77C\uC784 \uC18C\uB2E4\u00BB, never \u00AB\uB808\uBAA8\uB124\uC774\uB4DC\u00BB. " +
  "Write cocktail names in Hangul as Korean bars write them, with no middle dot. " +
  // Phrased as wording for the steps, like the Hindi tool sentence, so no tool
  // turns into an ingredient and fails the pantry check (0007 AC-8).
  "When a step names a bar tool, write shaker \u00AB\uC170\uC774\uCEE4\u00BB, strainer \u00AB\uC2A4\uD2B8\uB808\uC774\uB108\u00BB, muddler \u00AB\uBA38\uB4E4\uB7EC\u00BB, jigger \u00AB\uC9C0\uAC70\u00BB, and bar spoon \u00AB\uBC14 \uC2A4\uD47C\u00BB, and write glass names in Hangul. " +
  "Conjugate \uBD93\uB2E4 as \u00AB\uBD80\uC5B4\uC694\u00BB, never \u00AB\uBD93\uC5B4\uC694\u00BB or \u00AB\uBD93\uC544\uC694\u00BB. " +
  "Spell vermouth \u00AB\uBCA0\uB974\uBB34\uD2B8\u00BB, tequila \u00AB\uD14C\uD0AC\uB77C\u00BB, amaretto \u00AB\uC544\uB9C8\uB808\uD1A0\u00BB, Southern Comfort \u00AB\uC11C\uB358 \uCEF4\uD3EC\uD2B8\u00BB, champagne \u00AB\uC0F4\uD398\uC778\u00BB, half-and-half \u00AB\uD558\uD504 \uC564 \uD558\uD504\u00BB (not heavy cream), and mason jar \u00AB\uBA54\uC774\uC2A8 \uC790\u00BB. " +
  "Write glass as \u00AB\uAE00\uB77C\uC2A4\u00BB, never \u00AB\uAE00\uB798\uC2A4\u00BB, shake as \u00AB\uC170\uC774\uD06C\u00BB, and ounces as \u00AB\uC628\uC2A4\u00BB, never oz. " +
  "Use half width digits, Western punctuation with no space before it, and \u00AB\u201C \u201D\u00BB for quotes. ";

// Hand copies of normalizeKoreanTypography and normalizeKoreanName in
// packages/shared/src/koreanTypography.ts (spec 0051 AC-17, AC-22); change
// both in the same commit. Self contained, since locale.test.ts extracts and
// runs them.
function normalizeKoreanTypography(text: string): string {
  const hangul = "\\uAC00-\\uD7A3";
  const hasHangul = new RegExp(`[${hangul}]`);
  return text
    .normalize("NFC")
    .replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ")
    .replace(/\u3002/g, ".")
    .replace(/\u3001/g, ",")
    .replace(/[\u300C\u300E]/g, "\u201C")
    .replace(/[\u300D\u300F]/g, "\u201D")
    .replace(new RegExp(`(?<=[${hangul}])[ \\t]+(?=[.,?!])`, "g"), "")
    .replace(/"([^"\n]+)"/g, (pair, inner) =>
      hasHangul.test(inner) ? `\u201C${inner.trim()}\u201D` : pair,
    );
}

function normalizeKoreanName(text: string): string {
  const hasHangul = /[\uAC00-\uD7A3]/;
  return normalizeKoreanTypography(text)
    .replace(/[ \t]*[\u00B7\u30FB\uFF65\u2022\u2027\u2219][ \t]*/g, (dot, offset, whole) =>
      hasHangul.test(whole.charAt(offset - 1)) || hasHangul.test(whole.charAt(offset + dot.length))
        ? " "
        : dot,
    )
    .trim();
}

// Hand copy of LOCALE_AI_TERMS.zh in packages/shared/src/locale.ts (spec 0052
// AC-17); change both in the same commit.
// Mainland Simplified Chinese with \u00AB\u4F60\u00BB, never \u00AB\u60A8\u00BB, lime \u00AB\u9752\u67E0\u00BB, lemon \u00AB\u67E0\u6AAC\u00BB, established
// cocktail names or the English name, no middle dot, half width digits, full
// width punctuation \u00AB\uFF0C\u00BB \u00AB\u3002\u00BB \u00AB\uFF1F\u00BB \u00AB\uFF01\u00BB, \u00AB\u201C \u201D\u00BB quotes, and a space between Chinese and Latin.
const CHINESE_INSTRUCTION =
  "Write natural Simplified Chinese as used in mainland China, with no Traditional characters, addressing the reader as \u00AB\u4F60\u00BB, never \u00AB\u60A8\u00BB. " +
  "Lime is \u00AB\u9752\u67E0\u00BB and lemon is \u00AB\u67E0\u6AAC\u00BB. " +
  "Use the established mainland Chinese cocktail name where one exists, otherwise keep the name in English, with no middle dot; keep brand names in English. " +
  // Added after the AC-20 review of ten live ideas (2026-11-13). The tool and
  // syrup words are step wording, as in the Hindi and Korean sentences, so no
  // tool turns into an ingredient and fails the pantry check (0007 AC-8).
  "The name may mention only ingredients the recipe uses: never write \u00AB\u82CF\u6253\u00BB or another mixer the recipe does not use, and never borrow an established cocktail name such as \u00AB\u83AB\u5409\u6258\u00BB or \u00AB\u9A6C\u5929\u5C3C\u00BB unless the recipe is that cocktail. Write generic ingredient names in Chinese (Lime Vodka is \u00AB\u9752\u67E0\u4F0F\u7279\u52A0\u00BB); only brand names stay in English. " +
  "When a step names these, write simple syrup \u00AB\u7CD6\u6D46\u00BB, lime juice \u00AB\u9752\u67E0\u6C41\u00BB, shaker \u00AB\u6447\u9152\u58F6\u00BB, strainer \u00AB\u6EE4\u51B0\u5668\u00BB, and bar spoon \u00AB\u5427\u52FA\u00BB; strain is \u00AB\u6EE4\u5165\u00BB, never \u00AB\u5012\u5165\u00BB, chilled is \u00AB\u51B0\u9547\u00BB, and serve is \u00AB\u4EAB\u7528\u00BB or \u00AB\u5949\u4E0A\u00BB. Write steps as short commands with no pronoun (\u52A0\u5165\u51B0\u5757\uFF0C\u6447\u5300); never \u00AB\u4EAB\u7528\u4F60\u7684\u2026\u00BB. " +
  "Write amounts with ml, cl, L, or \u00AB\u76CE\u53F8\u00BB, never oz or \u00AB\u6BEB\u5347\u00BB, with a space between the number and the unit (30 ml). " +
  "Use half width digits, full width punctuation (\u00AB\uFF0C\u00BB \u00AB\u3002\u00BB \u00AB\uFF1F\u00BB \u00AB\uFF01\u00BB), \u00AB\u201C \u201D\u00BB for quotes, and one space between Chinese and Latin letters or digits. End every step with \u00AB\u3002\u00BB. ";

// Hand copies of normalizeChineseTypography and normalizeChineseName in
// packages/shared/src/chineseTypography.ts (spec 0052 AC-17, AC-22); change
// both in the same commit. Self contained, since locale.test.ts extracts and
// runs them. They never convert a Traditional character; this function
// carries no copy of the Traditional list.
function normalizeChineseTypography(text: string): string {
  const han = "\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF";
  const hasHan = new RegExp(`[${han}]`);
  const hanOrClosingQuote = new RegExp(`[${han}\\u201D]`);
  return text
    .normalize("NFC")
    .replace(/[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(/\u3000/g, " ")
    .replace(/[\u300C\u300E]/g, "\u201C")
    .replace(/[\u300D\u300F]/g, "\u201D")
    .replace(/"([^"\n]+)"/g, (pair, inner) =>
      hasHan.test(inner) ? `\u201C${inner.trim()}\u201D` : pair,
    )
    .replace(
      new RegExp(`(?<=[${han}\\u201DA-Za-z0-9%)])\\.(?=$|\\r?\\n|[ \\t]*[${han}])`, "g"),
      (dot, offset, whole) => {
        const start = whole.lastIndexOf("\n", offset - 1) + 1;
        const end = whole.indexOf("\n", offset);
        return hanOrClosingQuote.test(whole.charAt(offset - 1)) ||
          hasHan.test(whole.slice(start, end === -1 ? undefined : end))
          ? "\u3002"
          : dot;
      },
    )
    .replace(new RegExp(`(?<=[${han}\\u201D])[,?!:;]`, "g"), (mark) =>
      "\uFF0C\uFF1F\uFF01\uFF1A\uFF1B".charAt(",?!:;".indexOf(mark)),
    )
    .replace(
      new RegExp(`(?<=[A-Za-z0-9%)\\uFF09][ \\t]*)[,?!:;](?=[ \\t]*(?:[${han}]|$|\\r?\\n))`, "g"),
      (mark, offset, whole) => {
        const start = whole.lastIndexOf("\n", offset - 1) + 1;
        const end = whole.indexOf("\n", offset);
        return hasHan.test(whole.slice(start, end === -1 ? undefined : end))
          ? "\uFF0C\uFF1F\uFF01\uFF1A\uFF1B".charAt(",?!:;".indexOf(mark))
          : mark;
      },
    )
    .replace(/[ \t]+(?=[\uFF0C\u3002\uFF1F\uFF01\uFF1A\uFF1B\u3001])/g, "")
    .replace(/(?<=[\uFF0C\u3002\uFF1F\uFF01\uFF1A\uFF1B\u3001])[ \t]+/g, "")
    .replace(new RegExp(`(?<=[${han}]) +(?=[${han}])`, "g"), "")
    .replace(new RegExp(`(?<=[${han}])(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])(?=[${han}])`, "g"), " ");
}

function normalizeChineseName(text: string): string {
  const han = "\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF";
  const hasHan = new RegExp(`[${han}]`);
  return normalizeChineseTypography(text)
    .replace(/[ \t]*[\u00B7\u30FB\uFF65\u2022\u2027\u2219][ \t]*/g, (dot, offset, whole) =>
      hasHan.test(whole.charAt(offset - 1)) || hasHan.test(whole.charAt(offset + dot.length))
        ? ""
        : dot,
    )
    .replace(new RegExp(`(?<=[${han}])(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])(?=[${han}])`, "g"), " ")
    .trim();
}

const LOCALE_INSTRUCTIONS: Partial<Record<Locale, string>> = {
  fr: FRENCH_INSTRUCTION,
  ru: RUSSIAN_INSTRUCTION,
  hi: HINDI_INSTRUCTION,
  ja: JAPANESE_INSTRUCTION,
  ko: KOREAN_INSTRUCTION,
  zh: CHINESE_INSTRUCTION,
};

const LOCALE_TYPOGRAPHY: Partial<Record<Locale, (text: string) => string>> = {
  fr: normalizeFrenchTypography,
  ru: normalizeRussianTypography,
  hi: normalizeHindiTypography,
  ja: normalizeJapaneseTypography,
  ko: normalizeKoreanTypography,
  zh: normalizeChineseTypography,
};

/**
 * Names also lose a middle dot next to Hangul (spec 0051 AC-17) or next to a
 * Han character (spec 0052 AC-17); else LOCALE_TYPOGRAPHY.
 */
const LOCALE_NAME_TYPOGRAPHY: Partial<Record<Locale, (text: string) => string>> = {
  ko: normalizeKoreanName,
  zh: normalizeChineseName,
};

/** The locale's typography on the text its reader sees; source_name stays as matched. */
function typesetIdea(idea: DrinkIdea, locale: Locale): DrinkIdea {
  const typeset = LOCALE_TYPOGRAPHY[locale];
  if (typeset === undefined) {
    return idea;
  }
  const typesetName = LOCALE_NAME_TYPOGRAPHY[locale] ?? typeset;
  return {
    name: typesetName(idea.name),
    ingredients: idea.ingredients.map((ingredient) => ({
      ...ingredient,
      name: typesetName(ingredient.name),
      amount: typeset(ingredient.amount),
    })),
    steps: idea.steps.map(typeset),
  };
}

function parseLocale(value: unknown): Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value)
    ? (value as Locale)
    : DEFAULT_LOCALE;
}

const DrinkIdeaSchema = z.object({
  name: z.string().max(60),
  ingredients: z
    .array(z.object({ name: z.string(), source_name: z.string(), amount: z.string() }))
    .min(1)
    .max(8),
  steps: z.array(z.string()).min(1).max(10),
});

type DrinkIdea = z.infer<typeof DrinkIdeaSchema>;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function startOfNextUtcDay(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.toISOString();
}

function normalizeIngredientName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

async function generateWithClaude(
  anthropic: Anthropic,
  pantryNames: string[],
  locale: Locale,
): Promise<DrinkIdea | null> {
  const languageInstruction =
    locale === DEFAULT_LOCALE
      ? ""
      : `Write the name, ingredient names, and steps natively in ${LOCALE_NAMES[locale]}, ` +
        `as a native speaker would phrase them, not a literal translation. ` +
        (LOCALE_INSTRUCTIONS[locale] ?? "");

  const message = await anthropic.messages.parse(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content:
            `Invent one original cocktail or mocktail recipe using only these ingredients ` +
            `(you do not have to use all of them): ${pantryNames.join(", ")}.\n` +
            `${languageInstruction}` +
            `Give it a short, appealing name, a rough amount for each ingredient used, ` +
            `and numbered preparation steps. Do not use any ingredient not in this list. ` +
            `For each ingredient, also return "source_name": the exact English ingredient ` +
            `name from the list above (unchanged, for matching), alongside "name": the ` +
            `ingredient name written in the language requested above (or the same as ` +
            `source_name if no other language was requested).`,
        },
      ],
      output_config: {
        format: zodOutputFormat(DrinkIdeaSchema),
      },
    },
    { timeout: ANTHROPIC_TIMEOUT_MS },
  );

  const idea = message.parsed_output;
  if (!idea) {
    return null;
  }

  const pantrySet = new Set(pantryNames.map(normalizeIngredientName));
  const usesOnlyPantry = idea.ingredients.every((ingredient) =>
    pantrySet.has(normalizeIngredientName(ingredient.source_name)),
  );

  return usesOnlyPantry ? typesetIdea(idea, locale) : null;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    return error.status === undefined || error.status >= 500;
  }
  return true; // timeout, network error, or a schema/pantry mismatch (represented as thrown by caller)
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";

  let locale: Locale = DEFAULT_LOCALE;
  try {
    const body = await req.json();
    locale = parseLocale(body?.locale);
  } catch {
    // No body, or not JSON; default to English (matches the request's
    // pre step 8 shape, which never sent a body).
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: "no active session" }, 401);
  }

  const { data: pantryRows, error: pantryError } = await supabase
    .from("pantry_items")
    .select("ingredients ( name )");

  if (pantryError) {
    reportError(pantryError, { userId: user.id, stage: "pantry_read" });
    return jsonResponse({ error: "failed to read pantry" }, 502);
  }

  const pantryNames = (pantryRows ?? [])
    .map((row) => (row.ingredients as { name: string } | null)?.name)
    .filter((name): name is string => Boolean(name));

  if (pantryNames.length < MIN_PANTRY_INGREDIENTS) {
    return jsonResponse({ error: "pantry too small to generate from" }, 422);
  }

  const serviceRoleClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const isAnonymous = user.is_anonymous === true;
  const ipHashSecret = Deno.env.get("IP_HASH_SECRET");

  // Fail closed for guests: without the secret there is no IP layer, and the
  // IP layer must never be skipped (0034 AC-7). Signed in callers carry on.
  if (isAnonymous && !ipHashSecret) {
    reportError(new Error("IP_HASH_SECRET is not set"), {
      userId: user.id,
      stage: "ip_hash_secret",
    });
    return jsonResponse({ error: "temporarily unavailable" }, 503);
  }

  const ipHash =
    isAnonymous && ipHashSecret ? await guestIpHash(req.headers, ipHashSecret, user.id) : null;

  // One transaction locks and checks the global, IP, and user rows, then
  // claims all three or none (0034 AC-4). The day comes back from SQL so a
  // later release hits the same rows.
  const { data: reservation, error: reserveError } = await serviceRoleClient
    .rpc("reserve_ai_generation_slot", {
      p_user_id: user.id,
      p_is_anonymous: isAnonymous,
      p_ip_hash: ipHash,
      p_user_limit: isAnonymous ? ANON_DAILY_QUOTA : LINKED_DAILY_QUOTA,
      p_ip_limit: ANON_IP_DAILY_QUOTA,
      p_global_limit: GLOBAL_DAILY_CAP,
      p_anon_global_limit: ANON_GLOBAL_DAILY_CAP,
    })
    .single<Reservation>();

  if (reserveError || !reservation) {
    reportError(reserveError, { userId: user.id, stage: "quota_reserve" });
    return jsonResponse({ error: "failed to check quota" }, 502);
  }

  if (reservation.reason !== null) {
    if (reservation.reason === "ip_limit") {
      const ipHashPrefix = hashPrefix(ipHash);
      console.warn("AI quota: ip_limit refusal", { ipHashPrefix });
      if (sentryDsn) {
        Sentry.addBreadcrumb({
          category: "ai-quota",
          message: "ip_limit refusal",
          level: "warning",
          data: { ipHashPrefix },
        });
      }
    }

    return jsonResponse(
      {
        error: "daily generation limit reached",
        reason: reservation.reason,
        resetsAt: startOfNextUtcDay(),
        signInHelps: isAnonymous && reservation.total_count < GLOBAL_DAILY_CAP,
      },
      429,
    );
  }

  // Exactly one successful reservation lands on each threshold per day (0034 AC-9).
  if (reservation.total_count === ANON_GLOBAL_DAILY_CAP) {
    reportWarning("AI quota: guests cut off for today", {
      day: reservation.day,
      totalCount: reservation.total_count,
    });
  }
  if (reservation.total_count === GLOBAL_DAILY_CAP) {
    reportWarning("AI quota: global cap reached", {
      day: reservation.day,
      totalCount: reservation.total_count,
    });
  }

  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

  let idea: DrinkIdea | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      idea = await generateWithClaude(anthropic, pantryNames, locale);
      if (idea) break;
      lastError = new Error("generation did not match the expected shape");
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error)) break;
    }
  }

  if (!idea) {
    reportError(lastError, { userId: user.id, stage: "claude_generate" });

    // Give back every slot this request claimed, on the reserved day, so an
    // Anthropic outage cannot use up the day's caps. A failed release is only
    // reported; the caller still gets the 502 (0034 AC-4b).
    const { error: releaseError } = await serviceRoleClient.rpc("release_ai_generation_slot", {
      p_user_id: user.id,
      p_ip_hash: ipHash,
      p_day: reservation.day,
    });
    if (releaseError) {
      reportError(releaseError, {
        userId: user.id,
        ipHashPrefix: hashPrefix(ipHash),
        stage: "quota_release",
      });
    }

    return jsonResponse({ error: "generation failed" }, 502);
  }

  return jsonResponse({ ...idea, pantry_size: pantryNames.length }, 200);
});
