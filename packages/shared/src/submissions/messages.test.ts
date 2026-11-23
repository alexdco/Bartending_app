import { describe, expect, it } from "vitest";
import { recipeImageHash, recipeImageHashFromDigest } from "../recipeImages";
import { submissionHasPhotoAfterSave } from "./api";
import {
  submissionFieldMessage,
  submissionIngredientRowMessage,
  submissionIngredientsMessage,
  submissionSaveMessage,
} from "./messages";
import type { SubmissionValidationError } from "./validation";

describe("submissionFieldMessage (spec 0064 AC-2)", () => {
  it("is null when the field has no error", () => {
    expect(submissionFieldMessage([{ field: "note", reason: "too_long" }], "name")).toBeNull();
  });

  it("maps required, invalid, and too long with the field's own limit", () => {
    expect(submissionFieldMessage([{ field: "name", reason: "required" }], "name")).toEqual({
      key: "errorRequired",
    });
    expect(
      submissionFieldMessage([{ field: "alcoholicStatus", reason: "invalid" }], "alcoholicStatus"),
    ).toEqual({ key: "errorInvalidStatus" });
    expect(submissionFieldMessage([{ field: "name", reason: "too_long" }], "name")).toEqual({
      key: "errorTooLong",
      values: { max: 100 },
    });
    expect(
      submissionFieldMessage([{ field: "instructions", reason: "too_long" }], "instructions"),
    ).toEqual({ key: "errorTooLong", values: { max: 2000 } });
    expect(submissionFieldMessage([{ field: "glass", reason: "too_long" }], "glass")).toEqual({
      key: "errorTooLong",
      values: { max: 100 },
    });
    expect(submissionFieldMessage([{ field: "note", reason: "too_long" }], "note")).toEqual({
      key: "errorTooLong",
      values: { max: 300 },
    });
    expect(
      submissionFieldMessage([{ field: "displayName", reason: "too_long" }], "displayName"),
    ).toEqual({ key: "errorTooLong", values: { max: 50 } });
  });
});

describe("submissionIngredientsMessage", () => {
  it("maps none and too many, and ignores row errors", () => {
    expect(submissionIngredientsMessage([{ field: "ingredients", reason: "required" }])).toEqual({
      key: "errorIngredientsRequired",
    });
    expect(submissionIngredientsMessage([{ field: "ingredients", reason: "too_many" }])).toEqual({
      key: "errorTooManyIngredients",
      values: { max: 20 },
    });
    expect(
      submissionIngredientsMessage([{ field: "ingredients", reason: "name_required", index: 0 }]),
    ).toBeNull();
  });
});

describe("submissionIngredientRowMessage", () => {
  const errors: SubmissionValidationError[] = [
    { field: "ingredients", reason: "name_required", index: 0 },
    { field: "ingredients", reason: "measure_too_long", index: 0 },
    { field: "ingredients", reason: "name_too_long", index: 1 },
  ];

  it("puts each error under the right row and part", () => {
    expect(submissionIngredientRowMessage(errors, 0, "name")).toEqual({ key: "errorRequired" });
    expect(submissionIngredientRowMessage(errors, 0, "measure")).toEqual({
      key: "errorTooLong",
      values: { max: 50 },
    });
    expect(submissionIngredientRowMessage(errors, 1, "name")).toEqual({
      key: "errorTooLong",
      values: { max: 80 },
    });
    expect(submissionIngredientRowMessage(errors, 1, "measure")).toBeNull();
    expect(submissionIngredientRowMessage(errors, 2, "name")).toBeNull();
  });
});

describe("submissionSaveMessage (AC-5, AC-18)", () => {
  it("leaves validation to the fields", () => {
    expect(submissionSaveMessage({ reason: "validation", errors: [] })).toBeNull();
  });

  it("maps each server refusal", () => {
    expect(submissionSaveMessage({ reason: "pending_cap" })?.key).toBe("errorPendingCap");
    expect(submissionSaveMessage({ reason: "daily_cap" })?.key).toBe("errorDailyCap");
    expect(submissionSaveMessage({ reason: "blocked" })?.key).toBe("errorBlocked");
    expect(submissionSaveMessage({ reason: "not_editable" })?.key).toBe("errorNotEditable");
    expect(submissionSaveMessage({ reason: "anonymous" })?.key).toBe("signInTitle");
    expect(submissionSaveMessage({ reason: "display_name_required" })?.key).toBe(
      "errorDisplayNameRequired",
    );
    expect(submissionSaveMessage({ reason: "invalid", field: "photo" })?.key).toBe(
      "errorSaveFailed",
    );
    expect(submissionSaveMessage({ reason: "request_failed", message: "x" })?.key).toBe(
      "errorSaveFailed",
    );
  });

  it("tells a rejected photo apart from a failed upload", () => {
    expect(
      submissionSaveMessage({ reason: "photo_failed", upload: { reason: "too_large" } })?.key,
    ).toBe("photoErrorUploadRejected");
    expect(
      submissionSaveMessage({ reason: "photo_failed", upload: { reason: "wrong_type" } })?.key,
    ).toBe("photoErrorUploadRejected");
    expect(
      submissionSaveMessage({
        reason: "photo_failed",
        upload: { reason: "request_failed", message: "offline" },
      })?.key,
    ).toBe("photoUploadFailed");
  });
});

describe("submissionHasPhotoAfterSave", () => {
  it("reflects keep, replace, and remove", () => {
    expect(submissionHasPhotoAfterSave(null, { kind: "keep" })).toBe(false);
    expect(submissionHasPhotoAfterSave("u/s-abc", { kind: "keep" })).toBe(true);
    expect(submissionHasPhotoAfterSave("u/s-abc", { kind: "remove" })).toBe(false);
    expect(
      submissionHasPhotoAfterSave(null, {
        kind: "replace",
        image: { hero: new Uint8Array(), card: new Uint8Array(), hash: "0".repeat(16) },
      }),
    ).toBe(true);
  });
});

describe("recipeImageHashFromDigest", () => {
  it("matches recipeImageHash for the same bytes", async () => {
    const bytes = new TextEncoder().encode("hero bytes");
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    expect(recipeImageHashFromDigest(digest)).toBe(await recipeImageHash(bytes));
    expect(recipeImageHashFromDigest(digest)).toMatch(/^[0-9a-f]{16}$/);
  });
});
