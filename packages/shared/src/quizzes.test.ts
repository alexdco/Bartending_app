import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchQuizAttempt,
  fetchQuizBySource,
  fetchQuizDetail,
  fetchQuizzes,
  isQuizSourceType,
  QUIZ_SOURCE_TYPES,
  restoreQuizAnswers,
  splitExplanationAtAnchor,
  submitQuizAttempt,
} from "./quizzes";

// Builds a stub Supabase client whose query builder chain resolves to the
// given result, regardless of which methods are chained onto it (mirrors the
// shape fetchQuizzes/fetchQuizBySource/fetchQuizDetail/fetchQuizAttempt call).
function stubSupabase(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> & PromiseLike<typeof result> = {
    then: (onfulfilled) => Promise.resolve(result).then(onfulfilled),
  };
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.limit = vi.fn(chain);
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));

  const client = { from: vi.fn(() => builder) };
  return client as unknown as SupabaseClient;
}

describe("isQuizSourceType", () => {
  it("accepts every fixed source type (covers AC-1)", () => {
    for (const sourceType of QUIZ_SOURCE_TYPES) {
      expect(isQuizSourceType(sourceType)).toBe(true);
    }
  });

  it("rejects a value outside the fixed set", () => {
    expect(isQuizSourceType("recipe")).toBe(false);
    expect(isQuizSourceType(null)).toBe(false);
    expect(isQuizSourceType(undefined)).toBe(false);
  });
});

describe("fetchQuizzes", () => {
  it("maps published rows to summaries (covers AC-1)", async () => {
    const client = stubSupabase({
      data: [
        {
          id: "1",
          title: "Bar Tools Quiz",
          source_type: "learn_category",
          source_ref: "tools",
          published_at: "2026-01-01",
        },
      ],
      error: null,
    });

    const result = await fetchQuizzes(client);

    expect(result).toEqual([
      {
        id: "1",
        title: "Bar Tools Quiz",
        sourceType: "learn_category",
        sourceRef: "tools",
        publishedAt: "2026-01-01",
      },
    ]);
  });

  it("returns an empty list when data is null", async () => {
    const client = stubSupabase({ data: null, error: null });

    const result = await fetchQuizzes(client);

    expect(result).toEqual([]);
  });

  it("throws the Supabase error instead of swallowing it", async () => {
    const client = stubSupabase({ data: null, error: new Error("boom") });

    await expect(fetchQuizzes(client)).rejects.toThrow("boom");
  });
});

describe("fetchQuizBySource", () => {
  it("returns the matching quiz summary (covers AC-1)", async () => {
    const client = stubSupabase({
      data: {
        id: "1",
        title: "Caribbean Quiz",
        source_type: "recipe_region",
        source_ref: "Caribbean",
        published_at: "2026-01-01",
      },
      error: null,
    });

    const result = await fetchQuizBySource(client, "recipe_region", "Caribbean");

    expect(result).toEqual({
      id: "1",
      title: "Caribbean Quiz",
      sourceType: "recipe_region",
      sourceRef: "Caribbean",
      publishedAt: "2026-01-01",
    });
  });

  it("returns null when no quiz exists for the source, rather than a placeholder (covers AC-1)", async () => {
    const client = stubSupabase({ data: null, error: null });

    const result = await fetchQuizBySource(client, "learn_category", "wine");

    expect(result).toBeNull();
  });

  it("throws the Supabase error instead of swallowing it", async () => {
    const client = stubSupabase({ data: null, error: new Error("boom") });

    await expect(fetchQuizBySource(client, "learn_category", "wine")).rejects.toThrow("boom");
  });
});

describe("fetchQuizDetail", () => {
  it("returns the quiz with its questions sorted by sort_order (covers AC-2)", async () => {
    const client = stubSupabase({
      data: {
        id: "1",
        title: "Bar Tools Quiz",
        source_type: "learn_category",
        source_ref: "tools",
        published_at: "2026-01-01",
        quiz_questions: [
          {
            id: "q2",
            question_type: "true_false",
            prompt: "A jigger measures liquid.",
            options: ["True", "False"],
            correct_option_index: 0,
            explanation: null,
            sort_order: 1,
            source_anchor: null,
            learn_articles: null,
            recipes: null,
          },
          {
            id: "q1",
            question_type: "multiple_choice",
            prompt: "What is a jigger?",
            options: ["A tool", "A drink", "A glass", "A garnish"],
            correct_option_index: 0,
            explanation: "A jigger measures spirits.",
            sort_order: 0,
            source_anchor: null,
            learn_articles: null,
            recipes: null,
          },
        ],
      },
      error: null,
    });

    const result = await fetchQuizDetail(client, "1");

    expect(result?.questions.map((q) => q.id)).toEqual(["q1", "q2"]);
    expect(result?.questions[0]).toEqual({
      id: "q1",
      questionType: "multiple_choice",
      prompt: "What is a jigger?",
      options: ["A tool", "A drink", "A glass", "A garnish"],
      correctOptionIndex: 0,
      explanation: "A jigger measures spirits.",
      sortOrder: 0,
      source: null,
      sourceAnchor: null,
    });
  });

  function detailWithQuestion(question: Record<string, unknown>) {
    return {
      id: "1",
      title: "Quiz",
      source_type: "recipe_tag",
      source_ref: "tag-1",
      published_at: "2026-01-01",
      quiz_questions: [
        {
          id: "q1",
          question_type: "multiple_choice",
          prompt: "Which mug?",
          options: ["Copper", "Glass"],
          correct_option_index: 0,
          explanation: "A Moscow Mule is served in a copper mug.",
          sort_order: 0,
          source_anchor: "Moscow Mule",
          learn_articles: null,
          recipes: null,
          ...question,
        },
      ],
    };
  }

  it("maps an embedded recipe to a recipe source (covers spec 0042 AC-1)", async () => {
    const client = stubSupabase({
      data: detailWithQuestion({ recipes: { id: "r1", name: "Moscow Mule" } }),
      error: null,
    });

    const result = await fetchQuizDetail(client, "1");

    expect(result?.questions[0]?.source).toEqual({ kind: "recipe", id: "r1", name: "Moscow Mule" });
    expect(result?.questions[0]?.sourceAnchor).toBe("Moscow Mule");
  });

  it("maps an embedded article to an article source (covers spec 0042 AC-1)", async () => {
    const client = stubSupabase({
      data: detailWithQuestion({
        learn_articles: { id: "a1", title: "The Jigger", category: "tools" },
      }),
      error: null,
    });

    const result = await fetchQuizDetail(client, "1");

    expect(result?.questions[0]?.source).toEqual({
      kind: "article",
      id: "a1",
      title: "The Jigger",
      category: "tools",
    });
  });

  it("drops an article source whose category is not a Learn category (covers spec 0042 AC-3)", async () => {
    const client = stubSupabase({
      data: detailWithQuestion({
        learn_articles: { id: "a1", title: "Odd", category: "../admin" },
      }),
      error: null,
    });

    const result = await fetchQuizDetail(client, "1");

    expect(result?.questions[0]?.source).toBeNull();
  });

  it("keeps a question whose source is hidden by RLS, with a null source (covers spec 0042 AC-3)", async () => {
    const client = stubSupabase({ data: detailWithQuestion({}), error: null });

    const result = await fetchQuizDetail(client, "1");

    expect(result?.questions).toHaveLength(1);
    expect(result?.questions[0]?.source).toBeNull();
  });

  it("returns null on no match, rather than distinguishing why (covers AC-6)", async () => {
    const client = stubSupabase({ data: null, error: null });

    const result = await fetchQuizDetail(client, "missing-id");

    expect(result).toBeNull();
  });

  it("throws the Supabase error instead of swallowing it", async () => {
    const client = stubSupabase({ data: null, error: new Error("boom") });

    await expect(fetchQuizDetail(client, "1")).rejects.toThrow("boom");
  });
});

describe("splitExplanationAtAnchor (spec 0042 AC-1, AC-2)", () => {
  it("splits at a case insensitive match, keeping the explanation's casing", () => {
    expect(splitExplanationAtAnchor("A Moscow Mule is served cold.", "moscow mule")).toEqual({
      before: "A ",
      match: "Moscow Mule",
      after: " is served cold.",
    });
  });

  it("uses only the first occurrence", () => {
    expect(splitExplanationAtAnchor("Gin, then more gin.", "gin")).toEqual({
      before: "",
      match: "Gin",
      after: ", then more gin.",
    });
  });

  it("treats regex special characters in the anchor literally", () => {
    expect(
      splitExplanationAtAnchor("Try the St. Germain (elderflower)?", "St. Germain (elderflower)?"),
    ).toEqual({
      before: "Try the ",
      match: "St. Germain (elderflower)?",
      after: "",
    });
    expect(splitExplanationAtAnchor("Stx Germain", "St. Germain")).toBeNull();
  });

  it("trims the anchor before matching", () => {
    expect(splitExplanationAtAnchor("A Negroni is bitter.", "  Negroni ")?.match).toBe("Negroni");
  });

  it("returns null for an anchor shorter than 3 characters", () => {
    expect(splitExplanationAtAnchor("Ice is key.", "Ic")).toBeNull();
    expect(splitExplanationAtAnchor("Ice is key.", "  I  ")).toBeNull();
  });

  it("returns null for a null or empty explanation, a null anchor, or no match", () => {
    expect(splitExplanationAtAnchor(null, "Negroni")).toBeNull();
    expect(splitExplanationAtAnchor("", "Negroni")).toBeNull();
    expect(splitExplanationAtAnchor("A Negroni is bitter.", null)).toBeNull();
    expect(splitExplanationAtAnchor("A Negroni is bitter.", "Martini")).toBeNull();
  });
});

describe("restoreQuizAnswers (spec 0042 AC-5)", () => {
  const questions = [
    { id: "q1", options: ["a", "b", "c"] },
    { id: "q2", options: ["True", "False"] },
  ];

  it("returns a valid answers record", () => {
    expect(restoreQuizAnswers({ q1: 2, q2: 0 }, questions)).toEqual({ q1: 2, q2: 0 });
  });

  it("returns null for missing, extra, or unknown question ids", () => {
    expect(restoreQuizAnswers({ q1: 0 }, questions)).toBeNull();
    expect(restoreQuizAnswers({ q1: 0, q2: 0, q3: 0 }, questions)).toBeNull();
    expect(restoreQuizAnswers({ q1: 0, qx: 0 }, questions)).toBeNull();
  });

  it("returns null for out of range or non integer option indexes", () => {
    expect(restoreQuizAnswers({ q1: 3, q2: 0 }, questions)).toBeNull();
    expect(restoreQuizAnswers({ q1: -1, q2: 0 }, questions)).toBeNull();
    expect(restoreQuizAnswers({ q1: 0.5, q2: 0 }, questions)).toBeNull();
    expect(restoreQuizAnswers({ q1: "0", q2: 0 }, questions)).toBeNull();
  });

  it("returns null for non object input", () => {
    expect(restoreQuizAnswers(null, questions)).toBeNull();
    expect(restoreQuizAnswers("{}", questions)).toBeNull();
    expect(restoreQuizAnswers([0, 1], questions)).toBeNull();
    expect(restoreQuizAnswers(undefined, questions)).toBeNull();
  });
});

describe("fetchQuizAttempt", () => {
  it("returns the caller's saved best score (covers AC-5)", async () => {
    const client = stubSupabase({
      data: { score: 6, total: 8, completed_at: "2026-01-02" },
      error: null,
    });

    const result = await fetchQuizAttempt(client, "1");

    expect(result).toEqual({ score: 6, total: 8, completedAt: "2026-01-02" });
  });

  it("returns null when the caller has never attempted the quiz (covers AC-5)", async () => {
    const client = stubSupabase({ data: null, error: null });

    const result = await fetchQuizAttempt(client, "1");

    expect(result).toBeNull();
  });

  it("throws the Supabase error instead of swallowing it", async () => {
    const client = stubSupabase({ data: null, error: new Error("boom") });

    await expect(fetchQuizAttempt(client, "1")).rejects.toThrow("boom");
  });
});

function stubSupabaseForSubmit({
  sessionUserId = "user-1",
  rpcResult,
}: {
  sessionUserId?: string | null;
  rpcResult: { data: unknown; error: unknown };
}) {
  const client = {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({
          data: { session: sessionUserId ? { user: { id: sessionUserId } } : null },
          error: null,
        }),
      ),
      signInAnonymously: vi.fn(() =>
        Promise.resolve({ data: { session: { user: { id: "guest-1" } } }, error: null }),
      ),
    },
    rpc: vi.fn(() => Promise.resolve(rpcResult)),
  };
  return client as unknown as SupabaseClient;
}

describe("submitQuizAttempt", () => {
  it("saves the attempt when a session already exists (covers AC-5)", async () => {
    const client = stubSupabaseForSubmit({
      rpcResult: {
        data: {
          id: "a1",
          quiz_id: "1",
          user_id: "user-1",
          score: 6,
          total: 8,
          completed_at: "2026-01-02",
        },
        error: null,
      },
    });

    const result = await submitQuizAttempt(client, "1", 6, 8);

    expect(result).toEqual({
      saved: true,
      attempt: { score: 6, total: 8, completedAt: "2026-01-02" },
    });
  });

  it("creates a guest session first when none exists, then saves (covers AC-5)", async () => {
    const client = stubSupabaseForSubmit({
      sessionUserId: null,
      rpcResult: {
        data: {
          id: "a1",
          quiz_id: "1",
          user_id: "guest-1",
          score: 4,
          total: 5,
          completed_at: "2026-01-02",
        },
        error: null,
      },
    });

    const result = await submitQuizAttempt(client, "1", 4, 5);

    expect(client.auth.signInAnonymously).toHaveBeenCalled();
    expect(result).toEqual({
      saved: true,
      attempt: { score: 4, total: 5, completedAt: "2026-01-02" },
    });
  });

  it("returns a failure result instead of throwing when the save fails (covers AC-5)", async () => {
    const client = stubSupabaseForSubmit({
      rpcResult: { data: null, error: new Error("boom") },
    });

    const result = await submitQuizAttempt(client, "1", 6, 8);

    expect(result.saved).toBe(false);
  });
});
