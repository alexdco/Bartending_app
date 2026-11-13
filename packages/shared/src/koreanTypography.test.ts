import { describe, expect, it } from "vitest";
import { normalizeKoreanName, normalizeKoreanTypography } from "./koreanTypography";

/** Every sample both functions must leave fixed on a second run. */
const SAMPLES = [
  "１５ml",
  "ＧＩＮ",
  "얼음을 넣어요 .",
  "얼음을 넣어요。",
  "라임、레몬",
  "「김렛」",
  '"김렛"을',
  "진\u3000토닉",
  "얼음·라임",
  "1.5",
  "30ml",
  "https://example.com/a.b",
  "B-52",
  "(라임)",
  "ㅋㅋ",
  "Shake well. Strain.",
  "“진”",
  '2" 잔',
  "진·토닉",
  "진 · 토닉",
  "진･토닉",
  "진•토닉",
  "진·Tonic",
  "B·52",
  "A·B",
  "\u110C\u1175\u11AB",
  "",
] as const;

// covers: spec 0051 AC-1, AC-17, AC-22
describe("normalizeKoreanTypography", () => {
  it("turns full width ASCII into half width", () => {
    expect(normalizeKoreanTypography("１５ml")).toBe("15ml");
    expect(normalizeKoreanTypography("ＧＩＮ")).toBe("GIN");
    expect(normalizeKoreanTypography("좋아요！")).toBe("좋아요!");
  });

  it("turns the ideographic space into a space", () => {
    expect(normalizeKoreanTypography("진\u3000토닉")).toBe("진 토닉");
  });

  it("turns Japanese punctuation into Western punctuation", () => {
    expect(normalizeKoreanTypography("얼음을 넣어요。")).toBe("얼음을 넣어요.");
    expect(normalizeKoreanTypography("라임、레몬")).toBe("라임,레몬");
  });

  it("removes the space before punctuation after Hangul", () => {
    expect(normalizeKoreanTypography("얼음을 넣어요 .")).toBe("얼음을 넣어요.");
    expect(normalizeKoreanTypography("라임 , 레몬")).toBe("라임, 레몬");
    expect(normalizeKoreanTypography("정말요\t?")).toBe("정말요?");
  });

  it("turns corner brackets and straight quotes around Hangul into curly quotes", () => {
    expect(normalizeKoreanTypography("「김렛」")).toBe("“김렛”");
    expect(normalizeKoreanTypography("『김렛』")).toBe("“김렛”");
    expect(normalizeKoreanTypography('"김렛"을')).toBe("“김렛”을");
    expect(normalizeKoreanTypography('" 김렛 "을')).toBe("“김렛”을");
  });

  it("leaves middle dots, numbers, URLs, jamo, and Latin text alone", () => {
    for (const text of [
      "얼음·라임",
      "1.5",
      "30ml",
      "https://example.com/a.b",
      "B-52",
      "(라임)",
      "ㅋㅋ",
      "Shake well. Strain.",
      'Say "hi", then go!',
      "“진”",
      "라임: 30ml",
    ]) {
      expect(normalizeKoreanTypography(text)).toBe(text);
    }
  });

  it("leaves an odd count of straight quotes alone", () => {
    expect(normalizeKoreanTypography('2" 잔')).toBe('2" 잔');
  });

  it("composes conjoining jamo into syllables (NFC)", () => {
    expect(normalizeKoreanTypography("\u110C\u1175\u11AB")).toBe("진");
  });

  it("is idempotent", () => {
    for (const text of SAMPLES) {
      const once = normalizeKoreanTypography(text);
      expect(normalizeKoreanTypography(once)).toBe(once);
    }
  });
});

// covers: spec 0051 AC-3, AC-14, AC-17
describe("normalizeKoreanName", () => {
  it("turns a middle dot next to Hangul into one space", () => {
    for (const name of [
      "진·토닉",
      "진 · 토닉",
      "진･토닉",
      "진•토닉",
      "진・토닉",
      "진‧토닉",
      "진∙토닉",
    ]) {
      expect(normalizeKoreanName(name)).toBe("진 토닉");
    }
    expect(normalizeKoreanName("진·Tonic")).toBe("진 Tonic");
  });

  it("leaves a dot between Latin letters or digits alone", () => {
    expect(normalizeKoreanName("B·52")).toBe("B·52");
    expect(normalizeKoreanName("A·B")).toBe("A·B");
  });

  it("applies Korean typography and trims the ends", () => {
    expect(normalizeKoreanName(" 「진·토닉」 ")).toBe("“진 토닉”");
    expect(normalizeKoreanName("１５ 진")).toBe("15 진");
  });

  it("is idempotent", () => {
    for (const text of SAMPLES) {
      const once = normalizeKoreanName(text);
      expect(normalizeKoreanName(once)).toBe(once);
    }
  });
});
