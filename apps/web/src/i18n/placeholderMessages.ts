// Every en.json message that inserts a value other than a count, with the
// names it inserts (spec 0047 AC-12). Russian can't put an inserted name or
// noun inside a sentence that needs a case ending, so each of these is phrased
// as label plus value (`Не хватает: {names}`) in ru.json. The native reviewer
// checks this list; placeholderMessages.test.ts fails when en.json drifts from
// it, so a new message gets the same check before it ships.

export const REVIEWED_PLACEHOLDER_MESSAGES: Readonly<Record<string, readonly string[]>> = {
  "privacy.effectiveDate": ["date"],
  "home.popularIn": ["region"],
  "recipe.metaDescription": ["ingredients", "name"],
  "recipe.missingIngredients": ["names"],
  // Spec 0064 AC-16: the credit is label plus name in every locale.
  "recipe.submittedBy": ["name"],
  // Spec 0064 submit form: a row number and a character or row limit.
  "submissions.ingredientName": ["number"],
  "submissions.measure": ["number"],
  "submissions.noteHint": ["max"],
  "submissions.errorTooLong": ["max"],
  "submissions.errorTooManyIngredients": ["max"],
  "admin.recipeSubmissions.approveFailed": ["message"],
  "admin.recipeSubmissions.approveNotesFailed": ["message"],
  "admin.recipeSubmissions.rejectReasonTooLong": ["max"],
  "admin.recipeSubmissions.rejectFailed": ["message"],
  "admin.recipeSubmissions.blockFailed": ["message"],
  "search.metaTitleQuery": ["query"],
  "search.metaDescriptionQuery": ["query"],
  "batch.percent": ["value"],
  "batch.partSize": ["unit"],
  "batch.partSizeError": ["max", "min", "unit"],
  // The count as preformatted text before its plural word, and a batch
  // amount in parentheses (spec 0054 AC-13).
  "batch.countDash": ["value"],
  "batch.countSplash": ["value"],
  "batch.countDrop": ["value"],
  "batch.approx": ["amount"],
  "drinkIdeas.quotaExceededUntil": ["time"],
  // The AI idea's garnish, label plus value in every locale (spec 0059 AC-2).
  "drinkIdeas.garnish": ["name"],
  "drinkIdeas.optionalGarnish": ["name"],
  "favorites.toggleLabel": ["name"],
  "learn.takeTheQuiz": ["title"],
  "quizzes.best": ["score", "total"],
  "quizzes.score": ["score", "total"],
  "quizzes.question": ["number"],
  "quizzes.questionOf": ["number", "total"],
  "quizzes.yourAnswerCorrect": ["answer"],
  "quizzes.yourAnswerIncorrect": ["answer"],
  "quizzes.correctAnswer": ["answer"],
  "quizzes.readMore": ["name"],
  "quizzes.detailMetaDescription": ["title"],
  "popular.metaTitle": ["region"],
  "popular.metaDescription": ["region"],
  "popular.takeTheQuiz": ["title"],
  "ratings.summary": ["average"],
  "ratings.starsLabel": ["average"],
  "comments.errorTooLong": ["max"],
  "comments.errorTooManyPhotos": ["max"],
  "comments.errorDailyLimit": ["limit"],
  "comments.photoLabel": ["name", "number", "total"],
  "comments.photoDailyLimit": ["limit"],
  "comments.altTextLabel": ["number"],
  "comments.moveLeftLabel": ["number"],
  "comments.moveRightLabel": ["number"],
  "comments.replaceLabel": ["number"],
  "comments.removeLabel": ["number"],
  "comments.retryLabel": ["number"],
  "comments.addPhoto": ["count", "max"],
  "comments.photosMax": ["max"],
  // Report dialog note limit and counter, numbers only (spec 0062).
  "comments.report.noteCounter": ["count", "max"],
  "comments.report.errors.invalid_input": ["max"],
  // Admin review targets: "Photo 2", and Clear / Remove labels naming the
  // target, label plus value in ru (spec 0062).
  "admin.review.targetPhoto": ["number"],
  "admin.review.clearLabel": ["target"],
  "admin.review.removeLabel": ["target"],
  // Blocked people list: the block date and the Unblock label, label plus
  // value in ru (spec 0062).
  "account.blocked.blockedOn": ["date"],
  "account.blocked.unblockLabel": ["name"],
  "service.invitingTo": ["bar"],
  "service.seeMoreCount": ["count"],
  "service.partsAmount": ["parts"],
  "service.glass": ["value"],
  "service.ice": ["value"],
  "service.garnish": ["value"],
  // Spec 0065: the 86'd heading and the allergen tag are label plus value in every locale.
  "substitutes.heading": ["ingredient"],
  "substitutes.addsAllergens": ["allergens"],
  "admin.removePhotoLabel": ["label"],
  "admin.imageSaveFailed": ["message"],
  "admin.translationNotesHeading": ["language"],
  "admin.saveTranslationNotes": ["language"],
  "admin.errorNoTranslationRow": ["language"],
  "admin.translationNotesSaveFailed": ["message"],
  "admin.notesSaveFailed": ["message"],
  "admin.allergensFor": ["name"],
  "admin.saveAllergensFailed": ["message"],
  "admin.pageOf": ["page", "pages"],
  "admin.deletedRecipeNotice": ["name"],
  "moreLikeThis.metaTitle": ["name"],
  "moreLikeThis.metaDescription": ["name"],
};
