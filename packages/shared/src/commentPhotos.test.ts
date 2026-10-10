import { describe, expect, it } from "vitest";
import {
  COMMENT_PHOTO_MAX_ORIGINAL_BYTES,
  buildCommentPhotoPath,
  commentPhotoLabel,
  mapCommentRpcError,
  mapUploadError,
  normalizeCommentPhotoAltText,
  scaleToMaxEdge,
  validateCommentPhotoOriginal,
} from "./commentPhotos";

const PATH_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/;

describe("validateCommentPhotoOriginal", () => {
  it("accepts JPEG, PNG, WebP, and HEIC", () => {
    for (const mimeType of ["image/jpeg", "image/png", "image/webp", "image/heic"]) {
      expect(validateCommentPhotoOriginal({ sizeBytes: 1000, mimeType })).toBeNull();
    }
  });

  it("falls back to the extension when the type is empty", () => {
    expect(
      validateCommentPhotoOriginal({ sizeBytes: 1000, mimeType: "", fileName: "IMG_1.HEIC" }),
    ).toBeNull();
  });

  it("rejects other types", () => {
    expect(validateCommentPhotoOriginal({ sizeBytes: 1000, mimeType: "image/gif" })).toBe(
      "unsupported_type",
    );
  });

  it("rejects originals over 25 MB", () => {
    expect(
      validateCommentPhotoOriginal({
        sizeBytes: COMMENT_PHOTO_MAX_ORIGINAL_BYTES + 1,
        mimeType: "image/jpeg",
      }),
    ).toBe("original_too_large");
  });
});

describe("scaleToMaxEdge", () => {
  it("scales the long edge down to 1600, keeping the aspect ratio", () => {
    expect(scaleToMaxEdge(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(scaleToMaxEdge(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });

  it("never scales up", () => {
    expect(scaleToMaxEdge(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("buildCommentPhotoPath", () => {
  it("builds a path matching the storage policy pattern", () => {
    const path = buildCommentPhotoPath(
      "0b6a3f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
      "6F1E2D3C-4B5A-4978-8695-A4B3C2D1E0F9",
    );
    expect(path).toMatch(PATH_PATTERN);
  });
});

describe("normalizeCommentPhotoAltText", () => {
  it("trims, and blank becomes null", () => {
    expect(normalizeCommentPhotoAltText("  A coupe  ")).toBe("A coupe");
    expect(normalizeCommentPhotoAltText("   ")).toBeNull();
    expect(normalizeCommentPhotoAltText(null)).toBeNull();
  });
});

describe("commentPhotoLabel", () => {
  it("uses alt text when present", () => {
    expect(commentPhotoLabel({ altText: "A coupe", position: 0 }, 2, "Sam")).toBe("A coupe");
  });

  it("falls back to Photo N of M by name", () => {
    expect(commentPhotoLabel({ altText: null, position: 1 }, 3, null)).toBe(
      "Photo 2 of 3 by Anonymous",
    );
  });
});

describe("mapUploadError", () => {
  it("maps a policy rejection to the daily limit", () => {
    expect(
      mapUploadError({ message: "new row violates row-level security policy", status: 400 }),
    ).toEqual({
      reason: "daily_limit",
    });
    expect(mapUploadError({ message: "Forbidden", statusCode: "403" })).toEqual({
      reason: "daily_limit",
    });
  });

  it("maps size and type rejections", () => {
    expect(mapUploadError({ message: "Payload too large", status: 413 })).toEqual({
      reason: "too_large",
    });
    expect(
      mapUploadError({ message: "mime type image/png is not supported", status: 400 }),
    ).toEqual({
      reason: "wrong_type",
    });
  });

  it("keeps anything else as request_failed", () => {
    expect(mapUploadError({ message: "Failed to fetch" })).toEqual({
      reason: "request_failed",
      message: "Failed to fetch",
    });
  });
});

describe("mapCommentRpcError", () => {
  it("maps known function error codes", () => {
    expect(mapCommentRpcError({ message: "too_many_photos" })).toEqual({
      reason: "too_many_photos",
    });
    expect(mapCommentRpcError({ message: "comment_empty" })).toEqual({ reason: "comment_empty" });
  });

  it("maps anything else to request_failed", () => {
    expect(mapCommentRpcError({ message: "connection reset" })).toEqual({
      reason: "request_failed",
      message: "connection reset",
    });
  });
});
