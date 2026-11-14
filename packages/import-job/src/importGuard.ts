/**
 * Spec 0056 AC-8 and AC-15: which import runs may start. Pure.
 */

export interface ImportFlags {
  readonly dryRun: boolean;
  readonly diffLocks: boolean;
  readonly backfillDone: boolean;
}

export function parseImportFlags(argv: readonly string[]): ImportFlags {
  return {
    dryRun: argv.includes("--dry-run"),
    diffLocks: argv.includes("--diff-locks"),
    backfillDone: argv.includes("--backfill-done"),
  };
}

/** An error message when the flags can't be combined, else null. */
export function checkImportFlags(flags: ImportFlags): string | null {
  return flags.diffLocks && !flags.dryRun
    ? "--diff-locks only works with --dry-run (it never writes to the database)."
    : null;
}

export const BACKFILL_GUARD_MESSAGE = [
  "Refusing to import: no recipe has a source_hash yet, so this would be the first",
  "real import since admin edits started locking recipes (spec 0056). Run the backfill first,",
  "or the import may undo an earlier admin edit for good:",
  "  1. pnpm --filter @bartendingapp/import-job import --dry-run --diff-locks",
  "  2. Review packages/import-job/lock-candidates.json and delete entries you don't want locked",
  "  3. pnpm --filter @bartendingapp/import-job import:apply-locks",
  "  4. pnpm --filter @bartendingapp/import-job import --backfill-done",
].join("\n");

/**
 * True when a real run must stop (AC-15): no hashed run has happened yet and
 * --backfill-done wasn't passed. Dry runs never write, so they always pass.
 */
export function backfillGuardBlocks(flags: ImportFlags, hasHashedRun: boolean): boolean {
  return !flags.dryRun && !flags.backfillDone && !hasHashedRun;
}
