import { describe, expect, it } from "vitest";
import { normalizeJapaneseTypography } from "./japaneseTypography";

// covers: spec 0050 AC-1, AC-18, AC-22
describe("normalizeJapaneseTypography", () => {
  it("turns a sentence ending full stop into 。", () => {
    expect(normalizeJapaneseTypography("氷を入れます.シェイクします.")).toBe(
      "氷を入れます。シェイクします。",
    );
    expect(normalizeJapaneseTypography("氷を入れます.\n次に注ぎます.")).toBe(
      "氷を入れます。\n次に注ぎます。",
    );
    expect(normalizeJapaneseTypography("「ギムレット」.")).toBe("「ギムレット」。");
  });

  it("ends a Japanese line after a Latin unit with 。", () => {
    expect(normalizeJapaneseTypography("ジンを30ml.")).toBe("ジンを30ml。");
    expect(normalizeJapaneseTypography("ジンを30ml. 氷を入れます.")).toBe(
      "ジンを30ml。氷を入れます。",
    );
  });

  it("turns a comma after Japanese into 、", () => {
    expect(normalizeJapaneseTypography("ジン,ライム")).toBe("ジン、ライム");
    expect(normalizeJapaneseTypography("ジン, ライム")).toBe("ジン、ライム");
  });

  it("turns a straight quote pair around Japanese into 「」", () => {
    expect(normalizeJapaneseTypography('"ギムレット"')).toBe("「ギムレット」");
    expect(normalizeJapaneseTypography('これは"ギムレット"です.')).toBe(
      "これは「ギムレット」です。",
    );
  });

  it("widens half width katakana", () => {
    expect(normalizeJapaneseTypography("ｼﾞﾝ")).toBe("ジン");
    expect(normalizeJapaneseTypography("ｼﾞﾝ･ﾄﾆｯｸ")).toBe("ジン・トニック");
  });

  it("narrows full width digits", () => {
    expect(normalizeJapaneseTypography("１５ml")).toBe("15ml");
  });

  it("turns ! and ? after Japanese into full width marks", () => {
    expect(normalizeJapaneseTypography("本当に?")).toBe("本当に？");
    expect(normalizeJapaneseTypography("乾杯!")).toBe("乾杯！");
  });

  it("removes spaces between Japanese characters", () => {
    expect(normalizeJapaneseTypography("入れます。 次に")).toBe("入れます。次に");
    expect(normalizeJapaneseTypography("ジン トニック")).toBe("ジントニック");
  });

  it("leaves decimals, units, URLs, codes, abbreviations, and English alone", () => {
    expect(normalizeJapaneseTypography("1.5")).toBe("1.5");
    expect(normalizeJapaneseTypography("30ml")).toBe("30ml");
    expect(normalizeJapaneseTypography("https://example.com/a.b")).toBe("https://example.com/a.b");
    expect(normalizeJapaneseTypography("B-52")).toBe("B-52");
    expect(normalizeJapaneseTypography("Dr. Smith")).toBe("Dr. Smith");
    expect(normalizeJapaneseTypography("Shake well. Strain.")).toBe("Shake well. Strain.");
    expect(normalizeJapaneseTypography('Say "hi", then go!')).toBe('Say "hi", then go!');
    expect(normalizeJapaneseTypography("1.5オンス")).toBe("1.5オンス");
    expect(normalizeJapaneseTypography("ジン 30ml")).toBe("ジン 30ml");
  });

  it("leaves parentheses, colons, and full width marks alone", () => {
    expect(normalizeJapaneseTypography("ジン(ドライ):30ml")).toBe("ジン(ドライ):30ml");
    expect(normalizeJapaneseTypography("本当に！？")).toBe("本当に！？");
    expect(normalizeJapaneseTypography("ジン 〜 ライム")).toBe("ジン〜ライム");
  });

  it("stores the text in NFC", () => {
    const decomposed = "ジン";
    expect(normalizeJapaneseTypography(decomposed)).toBe("ジン");
    expect(normalizeJapaneseTypography(decomposed)).toBe(
      normalizeJapaneseTypography(decomposed).normalize("NFC"),
    );
  });

  it("is idempotent", () => {
    const messy = 'ｼﾞﾝを１５ml入れます. これは"ギムレット"です, 本当に? 入れます。 次に1.5オンス.';
    const once = normalizeJapaneseTypography(messy);
    expect(once).toBe(
      "ジンを15ml入れます。これは「ギムレット」です、本当に？入れます。次に1.5オンス。",
    );
    expect(normalizeJapaneseTypography(once)).toBe(once);
  });
});
