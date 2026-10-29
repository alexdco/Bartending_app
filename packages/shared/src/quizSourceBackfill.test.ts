import { describe, expect, it } from "vitest";
import type { QuizSourcePoolItem } from "./quizGeneration";
import {
  buildBackfillProposals,
  QuizSourcePlanSchema,
  type BackfillQuestion,
} from "./quizSourceBackfill";

const POOL: QuizSourcePoolItem[] = [
  { id: "11111111-1111-4111-8111-111111111111", label: "Daiquiri", contextText: "Rum, lime" },
  { id: "22222222-2222-4222-8222-222222222222", label: "Moscow Mule", contextText: "Vodka" },
];

const QUESTIONS: BackfillQuestion[] = [
  {
    id: "q-1",
    prompt: "Which mug?",
    correctOption: "Copper",
    explanation: "A Moscow Mule is served in a copper mug.",
  },
  { id: "q-2", prompt: "Base spirit?", correctOption: "Rum", explanation: "It uses rum." },
];

describe("buildBackfillProposals (spec 0042 AC-8)", () => {
  it("maps a source and an anchor found in the existing explanation", () => {
    const [first] = buildBackfillProposals(QUESTIONS, POOL, "recipe", {
      questions: [
        { questionNumber: 1, sourceIndex: 2, sourceAnchor: "moscow mule" },
        { questionNumber: 2, sourceIndex: 1, sourceAnchor: "rum" },
      ],
    });

    expect(first).toEqual({
      entry: {
        questionId: "q-1",
        sourceArticleId: null,
        sourceRecipeId: POOL[1]!.id,
        sourceAnchor: "Moscow Mule",
      },
      sourceLabel: "Moscow Mule",
      proposedAnchor: "moscow mule",
      anchorFound: true,
    });
  });

  it("matches answers by question number, not response order", () => {
    const proposals = buildBackfillProposals(QUESTIONS, POOL, "article", {
      questions: [
        { questionNumber: 2, sourceIndex: 1, sourceAnchor: null },
        { questionNumber: 1, sourceIndex: 2, sourceAnchor: null },
      ],
    });

    expect(proposals.map((proposal) => proposal.entry.sourceArticleId)).toEqual([
      POOL[1]!.id,
      POOL[0]!.id,
    ]);
  });

  it("produces a no source entry for a null sourceIndex, never a forced pick", () => {
    const [first] = buildBackfillProposals(QUESTIONS, POOL, "recipe", {
      questions: [
        { questionNumber: 1, sourceIndex: null, sourceAnchor: "Moscow Mule" },
        { questionNumber: 2, sourceIndex: 1, sourceAnchor: null },
      ],
    });

    expect(first?.entry).toEqual({
      questionId: "q-1",
      sourceArticleId: null,
      sourceRecipeId: null,
      sourceAnchor: null,
    });
    expect(first?.sourceLabel).toBeNull();
  });

  it("writes a null anchor when it is not found in the explanation", () => {
    const [, second] = buildBackfillProposals(QUESTIONS, POOL, "recipe", {
      questions: [
        { questionNumber: 1, sourceIndex: 2, sourceAnchor: null },
        { questionNumber: 2, sourceIndex: 1, sourceAnchor: "Daiquiri" },
      ],
    });

    expect(second?.entry.sourceRecipeId).toBe(POOL[0]!.id);
    expect(second?.entry.sourceAnchor).toBeNull();
    expect(second?.anchorFound).toBe(false);
  });

  it("throws (so the quiz is left out of the plan) for an out of range sourceIndex", () => {
    expect(() =>
      buildBackfillProposals(QUESTIONS, POOL, "recipe", {
        questions: [
          { questionNumber: 1, sourceIndex: 3, sourceAnchor: null },
          { questionNumber: 2, sourceIndex: 1, sourceAnchor: null },
        ],
      }),
    ).toThrow(/out of range sourceIndex/);
  });

  it("throws for a missing or repeated question number", () => {
    expect(() =>
      buildBackfillProposals(QUESTIONS, POOL, "recipe", {
        questions: [{ questionNumber: 1, sourceIndex: 1, sourceAnchor: null }],
      }),
    ).toThrow(/no entry for question 2/);
    expect(() =>
      buildBackfillProposals(QUESTIONS, POOL, "recipe", {
        questions: [
          { questionNumber: 1, sourceIndex: 1, sourceAnchor: null },
          { questionNumber: 1, sourceIndex: 2, sourceAnchor: null },
        ],
      }),
    ).toThrow(/repeats/);
  });
});

describe("QuizSourcePlanSchema (spec 0042 AC-8, AC-10)", () => {
  const entry = {
    questionId: "33333333-3333-4333-8333-333333333333",
    sourceArticleId: null,
    sourceRecipeId: POOL[0]!.id,
    sourceAnchor: "Daiquiri",
  };

  it("accepts a valid plan", () => {
    expect(QuizSourcePlanSchema.safeParse([entry]).success).toBe(true);
  });

  it("rejects an entry referencing both an article and a recipe", () => {
    expect(
      QuizSourcePlanSchema.safeParse([{ ...entry, sourceArticleId: POOL[1]!.id }]).success,
    ).toBe(false);
  });

  it("rejects a non id question reference", () => {
    expect(QuizSourcePlanSchema.safeParse([{ ...entry, questionId: "q-1" }]).success).toBe(false);
  });
});
