import { describe, expect, it } from "vitest";
import { backfillGuardBlocks, checkImportFlags, parseImportFlags } from "./importGuard";

const argv = (...flags: string[]) => ["node", "src/index.ts", ...flags];

describe("checkImportFlags (spec 0056 AC-8)", () => {
  it("rejects --diff-locks without --dry-run", () => {
    expect(checkImportFlags(parseImportFlags(argv("--diff-locks")))).toEqual(expect.any(String));
  });

  it("allows --diff-locks with --dry-run, and every run without it", () => {
    expect(checkImportFlags(parseImportFlags(argv("--dry-run", "--diff-locks")))).toBeNull();
    expect(checkImportFlags(parseImportFlags(argv()))).toBeNull();
    expect(checkImportFlags(parseImportFlags(argv("--backfill-done")))).toBeNull();
  });
});

describe("backfillGuardBlocks (spec 0056 AC-15)", () => {
  it("blocks a real run before any hashed run", () => {
    expect(backfillGuardBlocks(parseImportFlags(argv()), false)).toBe(true);
  });

  it("lets --backfill-done through", () => {
    expect(backfillGuardBlocks(parseImportFlags(argv("--backfill-done")), false)).toBe(false);
  });

  it("never fires again after the first hashed run", () => {
    expect(backfillGuardBlocks(parseImportFlags(argv()), true)).toBe(false);
  });

  it("never blocks a dry run", () => {
    expect(backfillGuardBlocks(parseImportFlags(argv("--dry-run")), false)).toBe(false);
  });
});
