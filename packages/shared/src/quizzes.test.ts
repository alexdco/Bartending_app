import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchQuizAttempt,
  fetchQuizBySource,
  fetchQuizDetail,
  fetchQuizzes,
  isQuizSourceType,
  QUIZ_SOURCE_TYPES,
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
          },
          {
            id: "q1",
            question_type: "multiple_choice",
            prompt: "What is a jigger?",
            options: ["A tool", "A drink", "A glass", "A garnish"],
            correct_option_index: 0,
            explanation: "A jigger measures spirits.",
            sort_order: 0,
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
    });
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
