// Shared plumbing for the spec 0043 propose and apply scripts: review file
// paths under tagging/, the --force guard, batching, and retries. Not a
// script itself (no package.json entry).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const HAIKU_MODEL = "claude-haiku-4-5-20251001";
export const MAX_RETRIES = 3;

/** Windows safe absolute path for a file in scripts/tagging/. */
export function reviewFilePath(fileName: string): string {
  return new URL(`./tagging/${fileName}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
}

/** Stops the run when the file exists and --force was not passed (AC-7, AC-9). */
export function refuseToOverwrite(path: string, force: boolean): void {
  if (existsSync(path) && !force) {
    console.error(
      `${path} already exists. Review and apply it first, or pass --force to replace it.`,
    );
    process.exit(1);
  }
}

export function writeReviewFile(path: string, rows: readonly unknown[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(rows, null, 2) + "\n");
}

export function readReviewFile(path: string): unknown {
  if (!existsSync(path)) {
    console.error(`${path} not found. Run the propose script first.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function chunk<T>(items: readonly T[], size: number): readonly T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );
}

/** Throws unless the response covers exactly the batch's ids, so the batch is retried. */
export function assertSameIds(expected: readonly string[], actual: readonly string[]): void {
  const want = [...expected].sort();
  const got = [...actual].sort();
  if (want.length !== got.length || want.some((id, i) => id !== got[i])) {
    throw new Error(`returned ids do not match the batch (${got.length} of ${want.length})`);
  }
}

/** Up to MAX_RETRIES attempts with backoff; null after the last failure. */
export async function withRetry<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await run();
    } catch (error) {
      console.error(`${label} failed (attempt ${attempt + 1}/${MAX_RETRIES}): ${error}`);
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
      }
    }
  }
  return null;
}

// Reads packages/shared/.env when present (gitignored), as
// backfill-quiz-sources.ts does. Variables already set in the shell are kept.
function loadLocalEnvFile(): void {
  try {
    process.loadEnvFile(new URL("../.env", import.meta.url));
  } catch {
    // No .env file: rely on the shell environment.
  }
}

/** Reads required env vars, exiting with the missing names when any is unset. */
export function requireEnv<const K extends string>(names: readonly K[]): Record<K, string> {
  loadLocalEnvFile();
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.error(`Missing ${missing.join(", ")}.`);
    process.exit(1);
  }
  return Object.fromEntries(names.map((name) => [name, process.env[name] ?? ""])) as Record<
    K,
    string
  >;
}
