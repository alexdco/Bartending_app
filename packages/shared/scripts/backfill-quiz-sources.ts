// Backfill for spec 0042 (quiz answer source links): proposes a source
// article or recipe plus an anchor phrase for every existing quiz question
// that has no source yet, across every quiz (draft, published, archived).
//
// Two steps, so nothing reaches the live database unreviewed (AC-8):
//   1. Dry run (no flags): one Haiku call per quiz, prints a table, saves the
//      proposal to a plan file. Writes nothing to the database.
//   2. --apply <plan file>: writes exactly the reviewed plan, with no Haiku
//      call. Each write only lands on a question that still has no source.
//
// Only source_article_id, source_recipe_id, and source_anchor are ever
// written; prompt, options, correct answer, and explanation never change, so
// saved best scores on published quizzes stay comparable (spec 0026).
//
// The keys come from the shell or from packages/shared/.env.
//
// Usage:
//   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     pnpm backfill-quiz-sources [--out quiz-source-plan.json] [--quiz <quizzes.id>]
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     pnpm backfill-quiz-sources --apply quiz-source-plan.json
import { readFileSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { Database } from "../src/database.types";
import { isLearnCategory } from "../src/learnArticles";
import {
  COMPACT_RECIPE_POOL_THRESHOLD,
  fetchLearnCategoryPool,
  fetchRecipePool,
  type QuizSourceKind,
  type QuizSourcePoolItem,
} from "../src/quizGeneration";
import {
  proposeQuizSources,
  QuizSourcePlanSchema,
  type BackfillQuestion,
  type ProposedQuizSource,
  type QuizSourcePlanEntry,
} from "../src/quizSourceBackfill";

const DEFAULT_PLAN_FILE = "quiz-source-plan.json";

function readArg(name: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Supabase = SupabaseClient<Database>;

interface QuizRow {
  id: string;
  title: string;
  status: string;
  source_type: string;
  source_ref: string;
  quiz_questions: {
    id: string;
    prompt: string;
    options: unknown;
    correct_option_index: number;
    explanation: string | null;
    sort_order: number;
    source_article_id: string | null;
    source_recipe_id: string | null;
  }[];
}

async function fetchQuizzes(supabase: Supabase, quizId: string | undefined): Promise<QuizRow[]> {
  const query = supabase
    .from("quizzes")
    .select(
      "id, title, status, source_type, source_ref, quiz_questions(id, prompt, options, correct_option_index, explanation, sort_order, source_article_id, source_recipe_id)",
    )
    .order("created_at", { ascending: true });

  const { data, error } = await (quizId ? query.eq("id", quizId) : query);
  if (error) {
    throw new Error(`Failed to read quizzes: ${error.message}`);
  }
  return data ?? [];
}

// The quiz's own grouping, so a proposed source can only come from the
// articles or recipes the quiz was drawn from (spec 0042 key invariants).
async function poolForQuiz(
  supabase: Supabase,
  quiz: QuizRow,
): Promise<{ kind: QuizSourceKind; pool: QuizSourcePoolItem[] } | { skip: string }> {
  if (quiz.source_type === "learn_category") {
    if (!isLearnCategory(quiz.source_ref)) {
      return { skip: `unknown Learn category "${quiz.source_ref}"` };
    }
    return { kind: "article", pool: await fetchLearnCategoryPool(supabase, quiz.source_ref) };
  }

  if (quiz.source_type === "recipe_tag" || quiz.source_type === "recipe_region") {
    const grouping = { sourceType: quiz.source_type, sourceRef: quiz.source_ref } as const;
    const pool = await fetchRecipePool(supabase, grouping);
    return {
      kind: "recipe",
      pool:
        pool.length > COMPACT_RECIPE_POOL_THRESHOLD
          ? await fetchRecipePool(supabase, grouping, { compact: true })
          : pool,
    };
  }

  return { skip: `unknown source_type "${quiz.source_type}"` };
}

function toBackfillQuestion(question: QuizRow["quiz_questions"][number]): BackfillQuestion {
  const options = Array.isArray(question.options) ? question.options.map(String) : [];
  return {
    id: question.id,
    prompt: question.prompt,
    correctOption: options[question.correct_option_index] ?? "",
    explanation: question.explanation,
  };
}

function printProposals(quiz: QuizRow, kind: QuizSourceKind, proposals: ProposedQuizSource[]) {
  console.table(
    proposals.map((proposal, index) => ({
      quiz: quiz.title,
      "#": index + 1,
      kind: proposal.sourceLabel ? kind : "none",
      name: proposal.sourceLabel ?? "",
      anchor: proposal.proposedAnchor ?? "",
      found: proposal.sourceLabel ? (proposal.anchorFound ? "Y" : "N") : "",
    })),
  );
}

async function dryRun(supabase: Supabase, anthropic: Anthropic) {
  const outFile = readArg("out") ?? DEFAULT_PLAN_FILE;
  const quizzes = await fetchQuizzes(supabase, readArg("quiz"));
  const plan: QuizSourcePlanEntry[] = [];
  const reports: string[] = [];

  for (const quiz of quizzes) {
    const label = `"${quiz.title}" (${quiz.id}, ${quiz.status})`;
    const unsourced = [...quiz.quiz_questions]
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
      .filter(
        (question) => question.source_article_id === null && question.source_recipe_id === null,
      );

    if (unsourced.length === 0) {
      reports.push(`${label}: every question already has a source, skipped`);
      continue;
    }

    try {
      const resolved = await poolForQuiz(supabase, quiz);
      if ("skip" in resolved) {
        reports.push(`${label}: ${resolved.skip}, skipped`);
        continue;
      }
      if (resolved.pool.length === 0) {
        reports.push(`${label}: its grouping has no remaining articles or recipes, skipped`);
        continue;
      }

      const proposals = await proposeQuizSources(anthropic, {
        questions: unsourced.map(toBackfillQuestion),
        pool: resolved.pool,
        kind: resolved.kind,
      });
      printProposals(quiz, resolved.kind, proposals);
      plan.push(...proposals.map((proposal) => proposal.entry));
      reports.push(`${label}: ${proposals.length} question(s) proposed`);
    } catch (error) {
      reports.push(`${label}: ${errorMessage(error)}, left out of the plan`);
    }
  }

  writeFileSync(outFile, `${JSON.stringify(plan, null, 2)}\n`, "utf-8");

  console.log("\nPer quiz:");
  reports.forEach((report) => console.log(`  - ${report}`));
  console.log(
    `\nPlan saved to ${outFile} (${plan.length} entries). Nothing was written to the database.` +
      `\nReview the table above, then run: pnpm --filter @bartendingapp/shared backfill-quiz-sources --apply ${outFile}`,
  );
}

async function apply(supabase: Supabase, planFile: string) {
  const parsed = QuizSourcePlanSchema.safeParse(JSON.parse(readFileSync(planFile, "utf-8")));
  if (!parsed.success) {
    console.error(`Plan file ${planFile} is invalid, no writes made:\n${parsed.error.message}`);
    process.exit(1);
  }

  const withSource = parsed.data.filter(
    (entry) => entry.sourceArticleId !== null || entry.sourceRecipeId !== null,
  );
  const results = { written: 0, alreadySourced: 0, failed: 0 };

  for (const entry of withSource) {
    // The where guard makes a rerun (or a question sourced since the dry
    // run) a no op instead of an overwrite.
    const { data, error } = await supabase
      .from("quiz_questions")
      .update({
        source_article_id: entry.sourceArticleId,
        source_recipe_id: entry.sourceRecipeId,
        source_anchor: entry.sourceAnchor,
      })
      .eq("id", entry.questionId)
      .is("source_article_id", null)
      .is("source_recipe_id", null)
      .select("id");

    if (error) {
      results.failed += 1;
      console.error(`  - ${entry.questionId}: ${error.message}`);
    } else if ((data ?? []).length === 0) {
      results.alreadySourced += 1;
    } else {
      results.written += 1;
    }
  }

  console.log(
    `\nApplied ${planFile}: ${results.written} written, ${results.alreadySourced} already had a source (unchanged), ` +
      `${results.failed} failed, ${parsed.data.length - withSource.length} with no source (nothing to write).`,
  );
  if (results.failed > 0) {
    process.exit(1);
  }
}

// Reads packages/shared/.env when present (gitignored). Variables already
// set in the shell are kept, never overwritten.
function loadLocalEnvFile(): void {
  try {
    process.loadEnvFile(new URL("../.env", import.meta.url));
  } catch {
    // No .env file: rely on the shell environment.
  }
}

async function main() {
  loadLocalEnvFile();
  const planFile = readArg("apply");
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  if (!supabaseUrl || !serviceRoleKey || (!planFile && !anthropicApiKey)) {
    console.error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (or ANTHROPIC_API_KEY for a dry run).",
    );
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  if (planFile) {
    await apply(supabase, planFile);
  } else {
    await dryRun(supabase, new Anthropic({ apiKey: anthropicApiKey }));
  }
}

main().catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exit(1);
});
