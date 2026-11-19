import { describe, expect, it } from "vitest";
import { hasPendingPhotos, moderationNote, parseModerationStatus } from "./moderation";

describe("parseModerationStatus", () => {
  it("keeps a known status", () => {
    expect(parseModerationStatus("pending")).toBe("pending");
    expect(parseModerationStatus("flagged")).toBe("flagged");
    expect(parseModerationStatus("approved")).toBe("approved");
  });

  it("treats a missing or unknown value as approved", () => {
    expect(parseModerationStatus(undefined)).toBe("approved");
    expect(parseModerationStatus("rejected")).toBe("approved");
    expect(parseModerationStatus(1)).toBe("approved");
  });
});

describe("moderationNote", () => {
  it("maps each status to the author's note", () => {
    expect(moderationNote("pending")).toBe("checking");
    expect(moderationNote("flagged")).toBe("under_review");
    expect(moderationNote("approved")).toBeNull();
  });
});

describe("hasPendingPhotos", () => {
  it("is true only when some photo is pending", () => {
    expect(hasPendingPhotos([])).toBe(false);
    expect(
      hasPendingPhotos([
        { photos: [{ moderationStatus: "approved" }, { moderationStatus: "flagged" }] },
        { photos: [] },
      ]),
    ).toBe(false);
    expect(hasPendingPhotos([{ photos: [] }, { photos: [{ moderationStatus: "pending" }] }])).toBe(
      true,
    );
  });
});
