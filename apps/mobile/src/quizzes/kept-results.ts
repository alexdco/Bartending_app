import { restoreQuizAnswers, type QuizAnswers, type QuizQuestion } from "@bartendingapp/shared";

// Kept quiz results (spec 0042 AC-5): submitted answers per quiz, held in
// memory for the app session so following a source link and going Back
// shows the same result. It must not rely on the quiz screen staying
// mounted, since a Learn link switches tabs and the hidden quizzes stack may
// unmount. Gone on app restart, by design.
const keptAnswers = new Map<string, QuizAnswers>();

export function keepQuizAnswers(quizId: string, answers: QuizAnswers): void {
  keptAnswers.set(quizId, answers);
}

// Only answers that still fit the quiz's current questions are restored.
export function readKeptQuizAnswers(
  quizId: string,
  questions: readonly Pick<QuizQuestion, "id" | "options">[],
): QuizAnswers | null {
  return restoreQuizAnswers(keptAnswers.get(quizId), questions);
}

export function clearKeptQuizAnswers(quizId: string): void {
  keptAnswers.delete(quizId);
}
