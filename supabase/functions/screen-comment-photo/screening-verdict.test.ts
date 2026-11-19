import { describe, expect, it } from "vitest";
import {
  MAX_PHOTO_BYTES,
  parseVerdict,
  photoFileProblem,
  VERDICT_TOOL_NAME,
  type VerdictMessage,
} from "./screening-verdict";

const toolMessage = (input: unknown, name = VERDICT_TOOL_NAME): VerdictMessage => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", name, input }],
});

describe("parseVerdict", () => {
  it("approves an allow verdict", () => {
    expect(parseVerdict(toolMessage({ verdict: "allow", categories: [] }))).toEqual({
      outcome: "approved",
    });
  });

  it("approves an allow verdict with categories missing", () => {
    expect(parseVerdict(toolMessage({ verdict: "allow" }))).toEqual({ outcome: "approved" });
  });

  it("flags with the reported categories, deduplicated", () => {
    expect(
      parseVerdict(
        toolMessage({
          verdict: "flag",
          categories: ["personal_info", "gore_violence", "personal_info"],
        }),
      ),
    ).toEqual({ outcome: "flagged", categories: ["personal_info", "gore_violence"] });
  });

  it("fails a flag with no categories", () => {
    expect(parseVerdict(toolMessage({ verdict: "flag", categories: [] }))).toEqual({
      outcome: "failed",
      reason: "flag_without_categories",
    });
  });

  it("fails an unknown category", () => {
    expect(parseVerdict(toolMessage({ verdict: "flag", categories: ["alcohol"] }))).toMatchObject({
      outcome: "failed",
      reason: "unknown_category",
    });
  });

  it("fails an unknown verdict", () => {
    expect(parseVerdict(toolMessage({ verdict: "maybe", categories: [] }))).toMatchObject({
      outcome: "failed",
      reason: "unknown_verdict",
    });
  });

  it("fails when no tool was called", () => {
    expect(parseVerdict({ stop_reason: "end_turn", content: [{ type: "text" }] })).toMatchObject({
      outcome: "failed",
    });
  });

  it("fails a refusal or a truncated reply even with a tool block", () => {
    expect(
      parseVerdict({ ...toolMessage({ verdict: "allow" }), stop_reason: "refusal" }),
    ).toMatchObject({ outcome: "failed", reason: "stop_reason:refusal" });
    expect(
      parseVerdict({ ...toolMessage({ verdict: "allow" }), stop_reason: "max_tokens" }),
    ).toMatchObject({ outcome: "failed" });
  });

  it("fails a call to some other tool", () => {
    expect(parseVerdict(toolMessage({ verdict: "allow" }, "other_tool"))).toMatchObject({
      outcome: "failed",
      reason: "no_tool_call",
    });
  });

  it("fails non object input and non array categories", () => {
    expect(parseVerdict(toolMessage("allow"))).toMatchObject({ outcome: "failed" });
    expect(
      parseVerdict(toolMessage({ verdict: "flag", categories: "gore_violence" })),
    ).toMatchObject({
      outcome: "failed",
      reason: "bad_categories",
    });
  });
});

describe("photoFileProblem", () => {
  const jpeg = (length: number) => {
    const bytes = new Uint8Array(length);
    bytes.set([0xff, 0xd8, 0xff]);
    return bytes;
  };

  it("accepts a JPEG within the size limit", () => {
    expect(photoFileProblem(jpeg(1024))).toBeNull();
    expect(photoFileProblem(jpeg(MAX_PHOTO_BYTES))).toBeNull();
  });

  it("rejects an empty, oversized, or non JPEG file", () => {
    expect(photoFileProblem(new Uint8Array())).toBe("empty_file");
    expect(photoFileProblem(jpeg(MAX_PHOTO_BYTES + 1))).toBe("file_too_large");
    expect(photoFileProblem(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("not_jpeg");
  });
});
