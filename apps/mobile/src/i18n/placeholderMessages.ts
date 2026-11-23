// Every en.json key (plural families as one) that inserts a value other than
// `count`, with the names it inserts (spec 0047 AC-12). Russian can't put an
// inserted name or noun inside a sentence that needs a case ending, so each of
// these is phrased as label plus value in ru.json. The native reviewer checks
// this list; placeholderMessages.test.ts fails when en.json drifts from it.

export const REVIEWED_PLACEHOLDER_MESSAGES: Readonly<Record<string, readonly string[]>> = {
  "ratings.summary": ["average"],
  "ratings.starsLabel": ["average"],
  "favorites.toggleLabel": ["name"],
  // The AI idea's garnish, label plus value in every locale (spec 0059 AC-2).
  "drinkIdeas.garnish": ["name"],
  "drinkIdeas.optionalGarnish": ["name"],
  // A batch amount in parentheses, label free in every locale (spec 0054 AC-13).
  "batch.approx": ["amount"],
  "batch.dash": ["value"],
  "batch.drop": ["value"],
  "batch.splash": ["value"],
  // Copied from web's reviewed batch.partSizeError; ru keeps the unit as a
  // label in parentheses, and min and max arrive preformatted (spec 0055 AC-12).
  "batch.partSizeError": ["max", "min", "unit"],
  // Copied from web's reviewed report and blocked list strings (spec 0062):
  // numbers only, or label plus value in ru.
  "comments.report.noteCounter": ["max"],
  "comments.report.errors.invalid_input": ["max"],
  "account.blocked.blockedOn": ["date"],
  "account.blocked.unblockLabel": ["name"],
  // Copied from web's reviewed submission strings (spec 0064 AC-24): ru
  // phrases each as label plus value, or numbers only.
  "recipe.submittedBy": ["name"],
  "submissions.ingredientName": ["number"],
  "submissions.measure": ["number"],
  "submissions.noteHint": ["max"],
  "submissions.errorTooLong": ["max"],
  "submissions.errorTooManyIngredients": ["max"],
};
