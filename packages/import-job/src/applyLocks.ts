import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@bartendingapp/shared";
import { parseLockCandidatesFile } from "./lockDiff";

/**
 * Spec 0056 AC-8: locks every source id left in the reviewed
 * lock-candidates.json (written by `import --dry-run --diff-locks`). The file
 * is validated in full before anything is written. Rerunnable: a recipe that
 * is already locked keeps its original lock time.
 */

const LOCK_CANDIDATES_PATH = fileURLToPath(new URL("../lock-candidates.json", import.meta.url));
// Keeps each `in (...)` filter well inside the request URL limit.
const CHUNK_SIZE = 200;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const chunk = <T>(items: readonly T[], size: number): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

function readSourceIds(): readonly string[] {
  const text = (() => {
    try {
      return readFileSync(LOCK_CANDIDATES_PATH, "utf-8");
    } catch {
      throw new Error(
        `No ${LOCK_CANDIDATES_PATH}. Run \`import --dry-run --diff-locks\` first; nothing was written.`,
      );
    }
  })();

  const json = (() => {
    try {
      return JSON.parse(text) as unknown;
    } catch (parseError) {
      throw new Error(
        `lock-candidates.json is not valid JSON, nothing was written: ${String(parseError)}`,
      );
    }
  })();

  const parsed = parseLockCandidatesFile(json);
  if (parsed.error !== null) {
    throw new Error(`lock-candidates.json failed validation, nothing was written: ${parsed.error}`);
  }
  return parsed.data;
}

/** The catalog source ids among `sourceIds` that exist, and whether each is already locked. */
async function fetchExisting(
  supabase: SupabaseClient<Database>,
  sourceIds: readonly string[],
): Promise<ReadonlyMap<string, boolean>> {
  const pages = await Promise.all(
    chunk(sourceIds, CHUNK_SIZE).map(async (ids) => {
      const { data, error } = await supabase
        .from("recipes")
        .select("source_id, admin_locked_at")
        .eq("source", "catalog")
        .in("source_id", ids);
      if (error) {
        throw new Error(`Could not read recipes to lock, nothing was written: ${error.message}`);
      }
      return data ?? [];
    }),
  );
  return new Map(pages.flat().map((row) => [row.source_id, row.admin_locked_at !== null]));
}

async function main(): Promise<void> {
  const supabase = createClient<Database>(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const sourceIds = readSourceIds();
  const existing = await fetchExisting(supabase, sourceIds);

  const unknown = sourceIds.filter((id) => !existing.has(id));
  const alreadyLocked = sourceIds.filter((id) => existing.get(id) === true);
  const toLock = sourceIds.filter((id) => existing.get(id) === false);

  const lockedAt = new Date().toISOString();
  const lockedCounts = await Promise.all(
    chunk(toLock, CHUNK_SIZE).map(async (ids) => {
      // The null filter keeps a lock taken since the read above untouched.
      const { data, error } = await supabase
        .from("recipes")
        .update({ admin_locked_at: lockedAt })
        .eq("source", "catalog")
        .in("source_id", ids)
        .is("admin_locked_at", null)
        .select("source_id");
      if (error) {
        throw new Error(`Locking failed partway; rerun to finish: ${error.message}`);
      }
      return (data ?? []).length;
    }),
  );

  const locked = lockedCounts.reduce((sum, count) => sum + count, 0);
  console.log(`Locked ${locked} recipe${locked === 1 ? "" : "s"}.`);
  if (alreadyLocked.length > 0) {
    console.log(`Already locked, left as they were: ${alreadyLocked.length}`);
  }
  if (unknown.length > 0) {
    console.warn(`No catalog recipe with these source ids, skipped: ${unknown.join(", ")}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
