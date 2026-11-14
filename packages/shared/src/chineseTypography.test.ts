import { describe, expect, it } from "vitest";
import { normalizeChineseName, normalizeChineseTypography } from "./chineseTypography";

/** Every sample both functions must leave fixed on a second run. */
const SAMPLES = [
  "１５ml",
  "ＧＩＮ",
  "加入冰块.",
  "青柠,柠檬",
  "好了吗?",
  "「金汤力」",
  '"金汤力"',
  "加入30 ml金酒",
  "用Boston摇酒壶",
  "冰块 ， 青柠",
  "加入 30 ml, 摇匀",
  "（可选）, 摇匀",
  "30盎司",
  "金 汤力",
  "金　汤力",
  "加入冰块. 摇匀. 滤入杯中.\n饰以青柠角.",
  "加入 Campari. 搅拌",
  '加入"金酒" 30ml.',
  "1.5",
  "30ml",
  "1:1",
  "https://example.com/a.b",
  "B-52",
  "(青柠)",
  "（青柠）",
  "Shake well. Strain.",
  'Say "hi", then go!',
  "汤姆·柯林斯",
  "汤姆 · 柯林斯",
  "汤姆・柯林斯",
  "金·Tonic",
  "B·52",
  "Jamaica Kiss",
  "“金酒”",
  '2" 杯',
  " 「汤姆·柯林斯」 ",
  "é 金酒",
  "",
] as const;

// covers: spec 0052 AC-1, AC-17, AC-22
describe("normalizeChineseTypography", () => {
  it("turns full width digits and Latin letters into half width", () => {
    expect(normalizeChineseTypography("１５ml")).toBe("15ml");
    expect(normalizeChineseTypography("ＧＩＮ")).toBe("GIN");
    expect(normalizeChineseTypography("ａｂｃ")).toBe("abc");
  });

  it("leaves full width punctuation and brackets alone", () => {
    for (const text of ["好了吗？", "加入冰块，摇匀。", "（青柠）", "比例：金酒；味美思！"]) {
      expect(normalizeChineseTypography(text)).toBe(text);
    }
  });

  it("turns the ideographic space into a space, then drops it between Han", () => {
    expect(normalizeChineseTypography("Gin　Tonic")).toBe("Gin Tonic");
    expect(normalizeChineseTypography("金　汤力")).toBe("金汤力");
  });

  it("turns corner brackets and straight quotes around Han into curly quotes", () => {
    expect(normalizeChineseTypography("「金汤力」")).toBe("“金汤力”");
    expect(normalizeChineseTypography("『金汤力』")).toBe("“金汤力”");
    expect(normalizeChineseTypography('"金汤力"')).toBe("“金汤力”");
    expect(normalizeChineseTypography('" 金汤力 "')).toBe("“金汤力”");
  });

  it("leaves a lone straight quote and a Latin only pair alone", () => {
    expect(normalizeChineseTypography('2" 杯')).toBe('2" 杯');
    expect(normalizeChineseTypography('Say "hi", then go!')).toBe('Say "hi", then go!');
  });

  it("turns a sentence ending full stop into 。", () => {
    expect(normalizeChineseTypography("加入冰块.")).toBe("加入冰块。");
    expect(normalizeChineseTypography("加入冰块. 摇匀. 滤入杯中.\n饰以青柠角.")).toBe(
      "加入冰块。摇匀。滤入杯中。\n饰以青柠角。",
    );
    expect(normalizeChineseTypography("加入 Campari. 搅拌")).toBe("加入 Campari。搅拌");
    expect(normalizeChineseTypography("加入金酒 30 ml.")).toBe("加入金酒 30 ml。");
    expect(normalizeChineseTypography('他说"好".')).toBe("他说“好”。");
  });

  it("turns ASCII marks after Han into full width marks", () => {
    expect(normalizeChineseTypography("青柠,柠檬")).toBe("青柠，柠檬");
    expect(normalizeChineseTypography("好了吗?")).toBe("好了吗？");
    expect(normalizeChineseTypography("干杯!")).toBe("干杯！");
    expect(normalizeChineseTypography("比例:金酒;味美思")).toBe("比例：金酒；味美思");
  });

  it("turns ASCII marks after Latin text into full width marks when Han follows", () => {
    expect(normalizeChineseTypography("加入 30 ml, 摇匀")).toBe("加入 30 ml，摇匀");
    expect(normalizeChineseTypography("（可选）, 摇匀")).toBe("（可选），摇匀");
    expect(normalizeChineseTypography("加入 Campari ;搅拌")).toBe("加入 Campari；搅拌");
    expect(normalizeChineseTypography("加入金酒 30 ml!")).toBe("加入金酒 30 ml！");
  });

  it("removes spaces around full width punctuation and between Han characters", () => {
    expect(normalizeChineseTypography("冰块 ， 青柠")).toBe("冰块，青柠");
    expect(normalizeChineseTypography("摇匀 。\t滤入杯中")).toBe("摇匀。滤入杯中");
    expect(normalizeChineseTypography("金 汤力")).toBe("金汤力");
  });

  it("never touches a newline", () => {
    expect(normalizeChineseTypography("加入冰块，\n摇匀")).toBe("加入冰块，\n摇匀");
    expect(normalizeChineseTypography("金\n汤力")).toBe("金\n汤力");
  });

  it("puts one space between Han and a Latin letter or digit", () => {
    expect(normalizeChineseTypography("加入30 ml金酒")).toBe("加入 30 ml 金酒");
    expect(normalizeChineseTypography("用Boston摇酒壶")).toBe("用 Boston 摇酒壶");
    expect(normalizeChineseTypography("30盎司")).toBe("30 盎司");
    expect(normalizeChineseTypography("2滴苦精")).toBe("2 滴苦精");
    expect(normalizeChineseTypography("加入 30 ml 金酒")).toBe("加入 30 ml 金酒");
  });

  it("puts no space next to punctuation, brackets, or %", () => {
    for (const text of ["(青柠)", "（青柠）", "酒精度40%的金酒", "“金酒”"]) {
      expect(normalizeChineseTypography(text)).toBe(
        text === "酒精度40%的金酒" ? "酒精度 40%的金酒" : text,
      );
    }
  });

  it("leaves numbers, URLs, middle dots, and Latin text alone", () => {
    for (const text of [
      "1.5",
      "30ml",
      "30 ml",
      "1:1",
      "10:30",
      "https://example.com/a.b",
      "B-52",
      "Shake well. Strain.",
      "Shake well, then strain!",
      "汤姆·柯林斯",
      "“金酒”",
      "Jamaica Kiss",
    ]) {
      expect(normalizeChineseTypography(text)).toBe(text);
    }
  });

  it("keeps a decimal and a ratio inside a Chinese line", () => {
    expect(normalizeChineseTypography("加入 1.5 盎司金酒，比例 1:1")).toBe(
      "加入 1.5 盎司金酒，比例 1:1",
    );
  });

  it("returns NFC text", () => {
    expect(normalizeChineseTypography("é 金酒")).toBe("é 金酒");
    for (const text of SAMPLES) {
      const out = normalizeChineseTypography(text);
      expect(out).toBe(out.normalize("NFC"));
    }
  });

  it("is idempotent", () => {
    for (const text of SAMPLES) {
      const once = normalizeChineseTypography(text);
      expect(normalizeChineseTypography(once)).toBe(once);
    }
  });
});

// covers: spec 0052 AC-14, AC-17
describe("normalizeChineseName", () => {
  it("removes a middle dot next to Han", () => {
    for (const name of [
      "汤姆·柯林斯",
      "汤姆 · 柯林斯",
      "汤姆・柯林斯",
      "汤姆･柯林斯",
      "汤姆•柯林斯",
      "汤姆‧柯林斯",
      "汤姆∙柯林斯",
    ]) {
      expect(normalizeChineseName(name)).toBe("汤姆柯林斯");
    }
  });

  it("puts a space where the removed dot leaves Han touching Latin", () => {
    expect(normalizeChineseName("金·Tonic")).toBe("金 Tonic");
    expect(normalizeChineseName("Gin · 汤力")).toBe("Gin 汤力");
  });

  it("leaves a dot between Latin letters or digits, and an English name, alone", () => {
    expect(normalizeChineseName("B·52")).toBe("B·52");
    expect(normalizeChineseName("Jamaica Kiss")).toBe("Jamaica Kiss");
  });

  it("applies Chinese typography and trims the ends", () => {
    expect(normalizeChineseName(" 「汤姆·柯林斯」 ")).toBe("“汤姆柯林斯”");
    expect(normalizeChineseName("金 汤力 ")).toBe("金汤力");
  });

  it("is idempotent", () => {
    for (const text of SAMPLES) {
      const once = normalizeChineseName(text);
      expect(normalizeChineseName(once)).toBe(once);
    }
  });
});
