import { describe, expect, it } from "vitest";
import { raisedCode, toSaveSubmissionError } from "./errors";

describe("toSaveSubmissionError (spec 0064)", () => {
  it("maps each raised code to its reason", () => {
    for (const code of [
      "anonymous",
      "blocked",
      "display_name_required",
      "pending_cap",
      "daily_cap",
      "not_editable",
    ]) {
      expect(toSaveSubmissionError({ code: "P0001", message: code })).toEqual({ reason: code });
    }
  });

  it("maps invalid_<field> to the form field", () => {
    expect(toSaveSubmissionError({ code: "P0001", message: "invalid_alcoholic_status" })).toEqual({
      reason: "invalid",
      field: "alcoholicStatus",
    });
    expect(toSaveSubmissionError({ code: "P0001", message: "invalid_photo" })).toEqual({
      reason: "invalid",
      field: "photo",
    });
  });

  it("treats anything else as a request failure", () => {
    expect(toSaveSubmissionError({ code: "P0001", message: "something new" })).toEqual({
      reason: "request_failed",
      message: "something new",
    });
    // Same text but not a raised code (e.g. a network or constraint error).
    expect(toSaveSubmissionError({ code: "23514", message: "pending_cap" })).toEqual({
      reason: "request_failed",
      message: "pending_cap",
    });
  });
});

describe("raisedCode", () => {
  it("returns the message only for P0001", () => {
    expect(raisedCode({ code: "P0001", message: "not_found" })).toBe("not_found");
    expect(raisedCode({ code: "PGRST116", message: "not_found" })).toBeNull();
  });
});
