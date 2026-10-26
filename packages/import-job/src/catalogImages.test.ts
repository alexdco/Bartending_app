import { describe, expect, it, vi } from "vitest";
import {
  copyCatalogImage,
  decideCatalogImage,
  resolveCatalogImages,
  type CopyDeps,
  type StoredImageState,
} from "./catalogImages";

const THUMB = "https://www.thecocktaildb.com/images/media/drink/margarita.jpg";
const NEW_THUMB = "https://www.thecocktaildb.com/images/media/drink/margarita-2.jpg";
const HERO =
  "https://x.supabase.co/storage/v1/object/public/recipe-images/catalog/11007/0123456789abcdef-hero.webp";

const copied: StoredImageState = {
  imageUrl: HERO,
  imageOrigin: "catalog_copy",
  imageSourceUrl: THUMB,
};
const admin: StoredImageState = {
  imageUrl: null,
  imageOrigin: "admin_upload",
  imageSourceUrl: null,
};
const hotlinked: StoredImageState = {
  imageUrl: THUMB,
  imageOrigin: "external_hotlink",
  imageSourceUrl: THUMB,
};

describe("decideCatalogImage", () => {
  it("never touches an admin upload or removal, flag on or off", () => {
    for (const flag of [true, false]) {
      expect(decideCatalogImage(NEW_THUMB, admin, flag)).toEqual({
        kind: "keep",
        fields: admin,
        reason: "admin_upload",
      });
    }
  });

  it("keeps a copy of the same thumb without downloading, flag on or off (AC-7, AC-9)", () => {
    for (const flag of [true, false]) {
      expect(decideCatalogImage(THUMB, copied, flag)).toEqual({
        kind: "keep",
        fields: copied,
        reason: "unchanged_copy",
      });
    }
  });

  it("copies a new recipe, a hotlink, or a changed thumb with the flag (AC-7)", () => {
    expect(decideCatalogImage(THUMB, undefined, true)).toEqual({ kind: "copy", thumbUrl: THUMB });
    expect(decideCatalogImage(THUMB, hotlinked, true)).toEqual({ kind: "copy", thumbUrl: THUMB });
    expect(decideCatalogImage(NEW_THUMB, copied, true)).toEqual({
      kind: "copy",
      thumbUrl: NEW_THUMB,
    });
  });

  it("hotlinks a new or changed thumb without the flag (AC-9)", () => {
    const expected = {
      kind: "set",
      fields: { imageUrl: NEW_THUMB, imageOrigin: "external_hotlink", imageSourceUrl: NEW_THUMB },
    };
    expect(decideCatalogImage(NEW_THUMB, undefined, false)).toEqual(expected);
    expect(decideCatalogImage(NEW_THUMB, copied, false)).toEqual(expected);
  });

  it("writes no image when the drink has no thumb", () => {
    expect(decideCatalogImage(null, hotlinked, true)).toEqual({
      kind: "set",
      fields: { imageUrl: null, imageOrigin: null, imageSourceUrl: null },
    });
  });
});

function fakeDeps(overrides: Partial<CopyDeps> = {}): CopyDeps {
  const pair = { hero: new Uint8Array([1]), card: new Uint8Array([2]), hash: "0123456789abcdef" };
  return {
    download: vi.fn().mockResolvedValue({ data: new Uint8Array([9]), error: null }),
    process: vi.fn().mockResolvedValue({ data: pair, error: null }),
    upload: vi.fn().mockResolvedValue({ data: { heroUrl: HERO }, error: null }),
    ...overrides,
  };
}

describe("copyCatalogImage", () => {
  it("stores the hero URL as catalog_copy with the thumb as its source", async () => {
    await expect(copyCatalogImage("11007", THUMB, fakeDeps())).resolves.toEqual({
      ok: true,
      fields: { imageUrl: HERO, imageOrigin: "catalog_copy", imageSourceUrl: THUMB },
    });
  });

  it("falls back to the hotlink when the download fails (AC-8)", async () => {
    const deps = fakeDeps({
      download: vi.fn().mockResolvedValue({ data: null, error: "HTTP 404" }),
    });
    await expect(copyCatalogImage("11007", THUMB, deps)).resolves.toEqual({
      ok: false,
      fields: { imageUrl: THUMB, imageOrigin: "external_hotlink", imageSourceUrl: THUMB },
      reason: "download: HTTP 404",
    });
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it("falls back when encoding or upload fails", async () => {
    const encodeFail = fakeDeps({
      process: vi.fn().mockResolvedValue({ data: null, error: "decode_failed" }),
    });
    const uploadFail = fakeDeps({
      upload: vi.fn().mockResolvedValue({ data: null, error: "forbidden" }),
    });
    await expect(copyCatalogImage("11007", THUMB, encodeFail)).resolves.toMatchObject({
      ok: false,
      reason: "encode: decode_failed",
    });
    await expect(copyCatalogImage("11007", THUMB, uploadFail)).resolves.toMatchObject({
      ok: false,
      reason: "upload: forbidden",
    });
  });
});

describe("resolveCatalogImages", () => {
  it("copies only what needs it, finishes despite a failure, and summarizes", async () => {
    const drinks = [
      { sourceId: "1", thumbUrl: THUMB }, // unchanged copy
      { sourceId: "2", thumbUrl: THUMB }, // new, copies
      { sourceId: "3", thumbUrl: NEW_THUMB }, // new, fails
      { sourceId: "4", thumbUrl: THUMB }, // admin, kept
    ];
    const stored = new Map([
      ["1", copied],
      ["4", admin],
    ]);
    const runCopies = vi.fn(async (jobs: readonly { sourceId: string; thumbUrl: string }[]) =>
      Promise.all(
        jobs.map((job) =>
          copyCatalogImage(
            job.sourceId,
            job.thumbUrl,
            job.sourceId === "3"
              ? fakeDeps({ download: vi.fn().mockResolvedValue({ data: null, error: "HTTP 404" }) })
              : fakeDeps(),
          ),
        ),
      ),
    );

    const result = await resolveCatalogImages(drinks, stored, true, runCopies);

    expect(runCopies.mock.calls[0]![0].map((job) => job.sourceId)).toEqual(["2", "3"]);
    expect(result.summary).toEqual({ copied: 1, unchanged: 1, failed: 1 });
    expect(result.failures).toEqual([{ sourceId: "3", reason: "download: HTTP 404" }]);
    expect(result.fieldsBySourceId.get("1")).toEqual(copied);
    expect(result.fieldsBySourceId.get("2")?.imageOrigin).toBe("catalog_copy");
    expect(result.fieldsBySourceId.get("3")?.imageOrigin).toBe("external_hotlink");
    expect(result.fieldsBySourceId.get("4")).toEqual(admin);
  });

  it("runs no copies without the flag", async () => {
    const runCopies = vi.fn(async () => []);
    const result = await resolveCatalogImages(
      [{ sourceId: "2", thumbUrl: THUMB }],
      new Map(),
      false,
      runCopies,
    );
    expect(runCopies).toHaveBeenCalledWith([]);
    expect(result.summary).toEqual({ copied: 0, unchanged: 0, failed: 0 });
  });
});
