// Source backfill for quizzes generated before spec 0042 (quiz answer source
// links), used by the backfill-quiz-sources.ts offline script. Server only
// (pulls in @anthropic-ai/sdk), so it stays out of the index.ts barrel.
//
// One Haiku call per quiz proposes, per question with no source yet, which
// pool item answers it and which phrase of the existing explanation to link.
// The proposal is reviewed as a dry run table and saved to a plan file;
// --apply writes that file verbatim with no new Haiku call. The backfill
// never touches a question's prompt, options, answer, or explanation.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { splitExplanationAtAnchor } from "./quizzes";
import {
  formatSourcePool,
  poolItemAt,
  QUIZ_MODEL,
  type QuizSourceKind,
  type QuizSourcePoolItem,
} from "./quizGeneration";

export interface BackfillQuestion {
  id: string;
  prompt: string;
  correctOption: string;
  explanation: string | null;
}

// One plan file entry. Exactly what --apply writes, nothing else.
export const QuizSourcePlanEntrySchema = z
  .object({
    questionId: z.guid(),
    sourceArticleId: z.guid().nullable(),
    sourceRecipeId: z.guid().nullable(),
    sourceAnchor: z.string().nullable(),
  })
  .refine((entry) => entry.sourceArticleId === null || entry.sourceRecipeId === null, {
    message: "an entry can reference an article or a recipe, never both",
  });

export const QuizSourcePlanSchema = z.array(QuizSourcePlanEntrySchema);

export type QuizSourcePlanEntry = z.infer<typeof QuizSourcePlanEntrySchema>;

// A plan entry plus what the dry run table shows for it.
export interface ProposedQuizSource {
  entry: QuizSourcePlanEntry;
  sourceLabel: string | null;
  proposedAnchor: string | null;
  anchorFound: boolean;
}

const BackfillResponseSchema = z.object({
  questions: z.array(
    z.object({
      questionNumber: z.number().int().describe("The question's number as listed below."),
      sourceIndex: z
        .number()
        .int()
        .nullable()
        .describe(
          "The number in square brackets of the one source that answers it, or null if none fits.",
        ),
      sourceAnchor: z
        .string()
        .nullable()
        .describe("A phrase copied word for word from the question's explanation, or null."),
    }),
  ),
});

export type BackfillResponse = z.infer<typeof BackfillResponseSchema>;

// Pure: turns Haiku's response into plan entries (spec 0042 AC-8). Throws
// (so the caller reports the quiz and leaves it out of the plan) when the
// response skips or repeats a question, or names an out of range source.
// A null sourceIndex becomes a no source entry, never a forced pick; an
// anchor not found in the existing explanation becomes null, so that
// question falls back to the "Read more" line.
export function buildBackfillProposals(
  questions: readonly BackfillQuestion[],
  pool: readonly QuizSourcePoolItem[],
  kind: QuizSourceKind,
  response: BackfillResponse,
): ProposedQuizSource[] {
  const byNumber = new Map(response.questions.map((answer) => [answer.questionNumber, answer]));
  if (byNumber.size !== response.questions.length) {
    throw new Error("the response repeats a question number");
  }

  return questions.map((question, index) => {
    const answer = byNumber.get(index + 1);
    if (!answer) {
      throw new Error(`the response has no entry for question ${index + 1}`);
    }

    if (answer.sourceIndex === null) {
      return {
        entry: {
          questionId: question.id,
          sourceArticleId: null,
          sourceRecipeId: null,
          sourceAnchor: null,
        },
        sourceLabel: null,
        proposedAnchor: null,
        anchorFound: false,
      };
    }

    const item = poolItemAt(pool, answer.sourceIndex);
    if (!item) {
      throw new Error(
        `out of range sourceIndex (${answer.sourceIndex}) for question ${index + 1}; the pool has ${pool.length} sources`,
      );
    }

    const split = splitExplanationAtAnchor(question.explanation, answer.sourceAnchor);
    return {
      entry: {
        questionId: question.id,
        sourceArticleId: kind === "article" ? item.id : null,
        sourceRecipeId: kind === "recipe" ? item.id : null,
        sourceAnchor: split?.match ?? null,
      },
      sourceLabel: item.label,
      proposedAnchor: answer.sourceAnchor,
      anchorFound: split !== null,
    };
  });
}

function formatQuestions(questions: readonly BackfillQuestion[]): string {
  return questions
    .map(
      (question, index) =>
        `Question ${index + 1}: ${question.prompt}\nCorrect answer: ${question.correctOption}\nExplanation: ${question.explanation ?? "(none)"}`,
    )
    .join("\n\n");
}

export async function proposeQuizSources(
  anthropic: Anthropic,
  input: {
    questions: readonly BackfillQuestion[];
    pool: readonly QuizSourcePoolItem[];
    kind: QuizSourceKind;
  },
): Promise<ProposedQuizSource[]> {
  const sourceNoun = input.kind === "article" ? "article" : "recipe";
  const message = await anthropic.messages.parse({
    model: QUIZ_MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content:
          `Below is a numbered list of ${sourceNoun}s from a home bartending app, followed by ` +
          "existing quiz questions about them. For every question, give `sourceIndex`: the number " +
          `in square brackets of the one ${sourceNoun} that holds its answer, or null if no listed ` +
          `${sourceNoun} fits (never force a wrong one). Give \`sourceAnchor\`: a phrase of at least 3 ` +
          "characters copied word for word from that question's explanation, ideally the " +
          `${sourceNoun}'s name, or null if the explanation contains no fitting phrase. Return one ` +
          "entry per question, keyed by its number.\n\n" +
          `${formatSourcePool(input.pool)}\n\n===\n\n${formatQuestions(input.questions)}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(BackfillResponseSchema),
    },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new Error("the backfill call did not return a parseable response");
  }

  return buildBackfillProposals(input.questions, input.pool, input.kind, parsed);
}
