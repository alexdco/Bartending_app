import { describe, expect, it } from "vitest";

import { parseEnvFile } from "./env-file";

describe("parseEnvFile", () => {
  it("reads keys, skips comments and blanks, and unquotes values", () => {
    const text = [
      "# Android demo account",
      "",
      "MAESTRO_DEMO_EMAIL=screenshots-android@bartendingapp.dev",
      'MAESTRO_DEMO_PASSWORD="p=ss word"',
      "  SPACED = value  ",
    ].join("\r\n");
    expect(parseEnvFile(text)).toEqual({
      MAESTRO_DEMO_EMAIL: "screenshots-android@bartendingapp.dev",
      MAESTRO_DEMO_PASSWORD: "p=ss word",
      SPACED: "value",
    });
  });
});
