import { describe, expect, it } from "vitest";
import { normalizeRussianTypography } from "./russianTypography";

const NBSP = " ";

describe("normalizeRussianTypography", () => {
  it("turns a straight quote pair into guillemets", () => {
    expect(normalizeRussianTypography('Коктейль "Мохито" со льдом.')).toBe(
      "Коктейль «Мохито» со льдом.",
    );
    expect(normalizeRussianTypography('"Мохито"')).toBe("«Мохито»");
  });

  it("turns a spaced hyphen or en dash into a spaced em dash", () => {
    expect(normalizeRussianTypography("лёд - обязательно")).toBe(`лёд${NBSP}— обязательно`);
    expect(normalizeRussianTypography("лёд – обязательно")).toBe(`лёд${NBSP}— обязательно`);
    expect(normalizeRussianTypography("лёд — обязательно")).toBe(`лёд${NBSP}— обязательно`);
  });

  it("leaves word hyphens, ranges, URLs, apostrophes, and unpaired quotes alone", () => {
    expect(normalizeRussianTypography("Добавьте 2-3 кубика.")).toBe("Добавьте 2-3 кубика.");
    expect(normalizeRussianTypography("светло-жёлтый")).toBe("светло-жёлтый");
    expect(normalizeRussianTypography("См. https://example.com/a-b?q=1")).toBe(
      "См. https://example.com/a-b?q=1",
    );
    expect(normalizeRussianTypography("Jack Daniel's")).toBe("Jack Daniel's");
    expect(normalizeRussianTypography('Один " без пары')).toBe('Один " без пары');
  });

  it("leaves text already inside guillemets alone", () => {
    expect(normalizeRussianTypography('«Он сказал "да" - и всё»')).toBe('«Он сказал "да" - и всё»');
  });

  it("is idempotent", () => {
    const messy = 'Коктейль "Мохито" - классика; 2-3 листика мяты.';
    const once = normalizeRussianTypography(messy);
    expect(once).toBe(`Коктейль «Мохито»${NBSP}— классика; 2-3 листика мяты.`);
    expect(normalizeRussianTypography(once)).toBe(once);
  });
});
