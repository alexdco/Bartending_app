// Every en.json key (plural families as one) that inserts a value other than
// `count`, with the names it inserts (spec 0047 AC-12). Russian can't put an
// inserted name or noun inside a sentence that needs a case ending, so each of
// these is phrased as label plus value in ru.json. The native reviewer checks
// this list; placeholderMessages.test.ts fails when en.json drifts from it.

export const REVIEWED_PLACEHOLDER_MESSAGES: Readonly<Record<string, readonly string[]>> = {
  "ratings.summary": ["average"],
  "ratings.starsLabel": ["average"],
  "favorites.toggleLabel": ["name"],
  // A batch amount in parentheses, label free in every locale (spec 0054 AC-13).
  "batch.approx": ["amount"],
};
