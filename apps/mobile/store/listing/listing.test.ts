import { describe, expect, it } from "vitest";

import { en } from "./en";
import { STORE_LISTINGS } from "./index";
import { STORE_LIMITS, findListingProblems, formatProblem, normalizeWords } from "./rules";
import type { StoreListing } from "./types";

// Spec 0057 build task 3 widens this to ["en", "es", "pt", "fr", "ja", "zh"].
const EXPECTED_LOCALES = ["en"];

const messages = (listing: StoreListing): readonly string[] =>
  findListingProblems(listing).map(formatProblem);

const withAppStore = (patch: Partial<StoreListing["appStore"]>): StoreListing => ({
  ...en,
  appStore: { ...en.appStore, ...patch },
});

const withDescriptions = (description: string): StoreListing => ({
  ...en,
  appStore: { ...en.appStore, description },
  play: { ...en.play, fullDescription: description },
});

describe("store listings", () => {
  it("has exactly the expected locales, once each", () => {
    expect(STORE_LISTINGS.map((listing) => listing.locale).sort()).toEqual(
      [...EXPECTED_LOCALES].sort(),
    );
  });

  it.each(STORE_LISTINGS.map((listing) => [listing.locale, listing] as const))(
    "%s passes every store rule",
    (_locale, listing) => {
      expect(messages(listing)).toEqual([]);
    },
  );
});

describe("findListingProblems", () => {
  it("names the locale and field of a description one character over the limit", () => {
    const tooLong = `${"a".repeat(STORE_LIMITS.description - en.ageLine.length)} ${en.ageLine}`;
    expect(messages(withDescriptions(tooLong))).toEqual([
      `en appStore.description is ${STORE_LIMITS.description + 1} characters, over the limit of ${STORE_LIMITS.description}`,
      `en play.fullDescription is ${STORE_LIMITS.description + 1} characters, over the limit of ${STORE_LIMITS.description}`,
    ]);
  });

  it("counts code points, so a CJK name is measured per character", () => {
    const name = `Cocktailist：${"カ".repeat(19)}`;
    expect([...name].length).toBe(31);
    expect(messages(withAppStore({ name }))).toContain(
      "en appStore.name is 31 characters, over the limit of 30",
    );
  });

  it("flags an empty field", () => {
    expect(messages(withAppStore({ promotionalText: "  " }))).toContain(
      "en appStore.promotionalText is empty",
    );
  });

  it("measures keywords joined with commas", () => {
    const keywords = ["a".repeat(50), "b".repeat(50)];
    expect(messages(withAppStore({ keywords }))).toContain(
      "en appStore.keywords is 101 characters, over the limit of 100",
    );
  });

  it("flags a name that does not start with the brand", () => {
    expect(messages(withAppStore({ name: "Cocktail Recipes" }))).toContain(
      'en appStore.name does not start with "Cocktailist"',
    );
  });

  it("flags a description that does not end with the age line", () => {
    expect(messages(withDescriptions("Make drinks from what you have."))).toEqual([
      "en appStore.description does not end with the age line",
      "en play.fullDescription does not end with the age line",
    ]);
  });

  it("flags a keyword that repeats a subtitle word, after normalizing", () => {
    expect(messages(withAppStore({ keywords: ["mixology", "Drinks"] }))).toContain(
      'en appStore.keywords the word "drinks" is already in the name or subtitle',
    );
  });

  it("flags a keyword word used twice", () => {
    expect(messages(withAppStore({ keywords: ["gin", "sloe gin"] }))).toContain(
      'en appStore.keywords repeats the word "gin"',
    );
  });

  it("flags a keyword with spaces around it", () => {
    expect(messages(withAppStore({ keywords: ["mixology", " gin"] }))).toContain(
      'en appStore.keywords keyword " gin" is empty, has spaces around it, or contains a comma',
    );
  });

  it.each([
    ["#1", 'contains the banned ranking word "#1"'],
    ["the best", 'contains the banned ranking word "best"'],
    ["Number One", 'contains the banned ranking word "number one"'],
  ])("flags the ranking phrase %s", (phrase, message) => {
    expect(messages(withAppStore({ promotionalText: `Cocktails, ${phrase}.` }))).toContain(
      `en appStore.promotionalText ${message}`,
    );
  });

  it("matches ranking words as whole words, so stop is not top", () => {
    expect(messages(withAppStore({ promotionalText: "Stop by the bar." }))).toEqual([]);
  });

  it("flags a digit and an emoji", () => {
    expect(messages(withAppStore({ promotionalText: "Over 500 recipes 🍸" }))).toEqual([
      "en appStore.promotionalText contains a number",
      "en appStore.promotionalText contains an emoji",
    ]);
  });

  it("compares CJK keywords as substrings of the name and subtitle", () => {
    const ja: StoreListing = {
      ...en,
      locale: "ja",
      appStore: {
        ...en.appStore,
        name: "Cocktailist：カクテルレシピ",
        subtitle: "家にあるもので作る",
        keywords: ["カクテル", "ジン", "ジン"],
      },
      screenshots: {
        captions: ["一", "二", "三", "四", "五", "六"],
        featureGraphicLine: "家にあるもので作る",
      },
    };
    expect(messages(ja)).toEqual([
      'ja appStore.keywords repeats "ジン"',
      'ja appStore.keywords "カクテル" is already in the name or subtitle',
    ]);
  });
});

describe("screenshot captions (spec 0060, AC-1)", () => {
  const withCaptions = (captions: readonly string[], locale = en.locale): StoreListing => ({
    ...en,
    locale,
    screenshots: {
      ...en.screenshots,
      captions: captions as unknown as StoreListing["screenshots"]["captions"],
    },
  });
  const replaceFirst = (caption: string): readonly string[] => [
    caption,
    ...en.screenshots.captions.slice(1),
  ];

  it("flags a seventh caption", () => {
    expect(messages(withCaptions([...en.screenshots.captions, "One more shot"]))).toEqual([
      "en screenshots.captions has 7 captions, expected 6",
    ]);
  });

  it("flags an English caption one code point over the limit", () => {
    const caption = "a".repeat(STORE_LIMITS.screenshotCaption.latin + 1);
    expect(messages(withCaptions(replaceFirst(caption)))).toEqual([
      "en screenshots.captions[0] is 41 characters, over the limit of 40",
    ]);
  });

  it("uses the CJK limit for ja", () => {
    const caption = "カ".repeat(STORE_LIMITS.screenshotCaption.cjk + 1);
    expect(messages(withCaptions(replaceFirst(caption), "ja"))).toContain(
      "ja screenshots.captions[0] is 19 characters, over the limit of 18",
    );
  });

  it("flags a caption with a digit and one with an emoji", () => {
    expect(
      messages(
        withCaptions(["Over 500 recipes", "Cheers 🍸", ...en.screenshots.captions.slice(2)]),
      ),
    ).toEqual([
      "en screenshots.captions[0] contains a number",
      "en screenshots.captions[1] contains an emoji",
    ]);
  });

  it("flags a banned ranking word in the feature graphic line", () => {
    const listing: StoreListing = {
      ...en,
      screenshots: { ...en.screenshots, featureGraphicLine: "The best cocktail app" },
    };
    expect(messages(listing)).toEqual([
      'en screenshots.featureGraphicLine contains the banned ranking word "best"',
    ]);
  });

  it("flags a feature graphic line over the limit", () => {
    const listing: StoreListing = {
      ...en,
      screenshots: {
        ...en.screenshots,
        featureGraphicLine: "a".repeat(STORE_LIMITS.featureGraphicLine.latin + 1),
      },
    };
    expect(messages(listing)).toEqual([
      "en screenshots.featureGraphicLine is 49 characters, over the limit of 48",
    ]);
  });
});

describe("normalizeWords", () => {
  it("strips accents, lowercases, and splits French apostrophes", () => {
    expect(normalizeWords("L'Apéritif, Crème")).toEqual(["l", "aperitif", "creme"]);
  });
});
