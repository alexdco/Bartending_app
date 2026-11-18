// Store limits and the one listing check shared by the listing test and the
// `store:metadata` generator, so the two can never disagree.
// Spec: docs/specs/0057-store-listing-app-icon/index.md (AC-1 to AC-4)
import { BRAND_NAME } from "@bartendingapp/shared/brand";

import { BANNED_WORDS } from "./banned";
import type { ListingLocale, StoreListing } from "./types";

/** Lengths are Unicode code points, one per character for CJK too. */
export const STORE_LIMITS = {
  appStoreName: 30,
  playTitle: 30,
  subtitle: 30,
  /** The joined keyword string, commas included. */
  keywords: 100,
  promotionalText: 170,
  playShortDescription: 80,
  description: 4000,
  releaseNotes: 500,
} as const;

export interface ListingProblem {
  readonly locale: ListingLocale;
  readonly field: string;
  readonly message: string;
}

const CJK_LOCALES: ReadonlySet<ListingLocale> = new Set(["ja", "zh"]);

export const isCjkLocale = (locale: ListingLocale): boolean => CJK_LOCALES.has(locale);

export const codePointLength = (text: string): number => [...text].length;

export const joinKeywords = (keywords: readonly string[]): string => keywords.join(",");

/**
 * Splits Latin script text into comparable words: NFKD with accents stripped,
 * lowercased, split on anything that is not a letter (so French apostrophes
 * split too).
 */
export const normalizeWords = (text: string): readonly string[] =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length > 0);

const DIGIT = /\p{Nd}/u;
const EMOJI = /\p{Extended_Pictographic}/u;

// Terms with anything besides letters and spaces ("#1", "No. 1") would lose
// their digits to the normalizer, so they match as plain substrings.
const isPlainWordTerm = (term: string): boolean => /^[\p{L}\s]+$/u.test(term);

const containsBannedTerm = (locale: ListingLocale, text: string, term: string): boolean => {
  if (isCjkLocale(locale) || !isPlainWordTerm(term)) {
    return text.toLowerCase().includes(term.toLowerCase());
  }
  // Whole word runs, so "top" never matches "stop" and "number one" needs both words.
  const haystack = ` ${normalizeWords(text).join(" ")} `;
  return haystack.includes(` ${normalizeWords(term).join(" ")} `);
};

interface TextField {
  readonly field: string;
  readonly text: string;
  readonly limit?: number;
}

const textFields = (listing: StoreListing): readonly TextField[] => [
  { field: "ageLine", text: listing.ageLine },
  { field: "releaseNotes", text: listing.releaseNotes, limit: STORE_LIMITS.releaseNotes },
  { field: "appStore.name", text: listing.appStore.name, limit: STORE_LIMITS.appStoreName },
  { field: "appStore.subtitle", text: listing.appStore.subtitle, limit: STORE_LIMITS.subtitle },
  {
    field: "appStore.keywords",
    text: joinKeywords(listing.appStore.keywords),
    limit: STORE_LIMITS.keywords,
  },
  {
    field: "appStore.promotionalText",
    text: listing.appStore.promotionalText,
    limit: STORE_LIMITS.promotionalText,
  },
  {
    field: "appStore.description",
    text: listing.appStore.description,
    limit: STORE_LIMITS.description,
  },
  { field: "play.title", text: listing.play.title, limit: STORE_LIMITS.playTitle },
  {
    field: "play.shortDescription",
    text: listing.play.shortDescription,
    limit: STORE_LIMITS.playShortDescription,
  },
  {
    field: "play.fullDescription",
    text: listing.play.fullDescription,
    limit: STORE_LIMITS.description,
  },
];

const fieldProblems = (listing: StoreListing): readonly ListingProblem[] =>
  textFields(listing).flatMap(({ field, text, limit }) => {
    const problem = (message: string): ListingProblem => ({
      locale: listing.locale,
      field,
      message,
    });
    const length = codePointLength(text);
    return [
      ...(text.trim().length === 0 ? [problem("is empty")] : []),
      ...(limit !== undefined && length > limit
        ? [problem(`is ${length} characters, over the limit of ${limit}`)]
        : []),
      ...(DIGIT.test(text) ? [problem("contains a number")] : []),
      ...(EMOJI.test(text) ? [problem("contains an emoji")] : []),
      ...BANNED_WORDS[listing.locale]
        .filter((term) => containsBannedTerm(listing.locale, text, term))
        .map((term) => problem(`contains the banned ranking word "${term}"`)),
    ];
  });

const brandProblems = (listing: StoreListing): readonly ListingProblem[] =>
  [
    { field: "appStore.name", text: listing.appStore.name },
    { field: "play.title", text: listing.play.title },
  ]
    .filter(({ text }) => !text.startsWith(BRAND_NAME))
    .map(({ field }) => ({
      locale: listing.locale,
      field,
      message: `does not start with "${BRAND_NAME}"`,
    }));

const ageLineProblems = (listing: StoreListing): readonly ListingProblem[] =>
  [
    { field: "appStore.description", text: listing.appStore.description },
    { field: "play.fullDescription", text: listing.play.fullDescription },
  ]
    .filter(({ text }) => !text.trimEnd().endsWith(listing.ageLine.trim()))
    .map(({ field }) => ({
      locale: listing.locale,
      field,
      message: "does not end with the age line",
    }));

const duplicates = (values: readonly string[]): readonly string[] => [
  ...new Set(values.filter((value, index) => values.indexOf(value) !== index)),
];

const keywordProblems = (listing: StoreListing): readonly ListingProblem[] => {
  const { locale } = listing;
  const { keywords, name, subtitle } = listing.appStore;
  const problem = (message: string): ListingProblem => ({
    locale,
    field: "appStore.keywords",
    message,
  });

  const shapeProblems = keywords
    .filter(
      (keyword) =>
        keyword.trim().length === 0 || keyword !== keyword.trim() || keyword.includes(","),
    )
    .map((keyword) =>
      problem(`keyword "${keyword}" is empty, has spaces around it, or contains a comma`),
    );

  if (isCjkLocale(locale)) {
    return [
      ...shapeProblems,
      ...duplicates(keywords).map((keyword) => problem(`repeats "${keyword}"`)),
      ...keywords
        .filter((keyword) => name.includes(keyword) || subtitle.includes(keyword))
        .map((keyword) => problem(`"${keyword}" is already in the name or subtitle`)),
    ];
  }

  const keywordWords = keywords.flatMap(normalizeWords);
  const takenWords = new Set([...normalizeWords(name), ...normalizeWords(subtitle)]);
  return [
    ...shapeProblems,
    ...duplicates(keywordWords).map((word) => problem(`repeats the word "${word}"`)),
    ...[...new Set(keywordWords)]
      .filter((word) => takenWords.has(word))
      .map((word) => problem(`the word "${word}" is already in the name or subtitle`)),
  ];
};

/** Every rule the test can check for one listing; empty means it passes. */
export const findListingProblems = (listing: StoreListing): readonly ListingProblem[] => [
  ...fieldProblems(listing),
  ...brandProblems(listing),
  ...ageLineProblems(listing),
  ...keywordProblems(listing),
];

export const formatProblem = ({ locale, field, message }: ListingProblem): string =>
  `${locale} ${field} ${message}`;
