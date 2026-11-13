import { describe, expect, it } from "vitest";
import { checkBuiltCss, fontStylesheetUrls, rewriteFontStylesheet } from "./font-stylesheet";

// Spec 0050 AC-11: the Noto JP fonts ship as a self hosted stylesheet linked
// on /ja only, and the shared CSS never carries their @font-face rules.

const face = (family: string, url: string, format = "woff2") => `/* [0] */
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url(${url}) format('${format}');
  unicode-range: U+25ee8, U+25f23;
}`;

const SANS = "https://fonts.gstatic.com/s/notosansjp/v54/a-b.0.woff2";
const SERIF = "https://fonts.gstatic.com/s/notoserifjp/v30/c_d.1.woff2";
const sample = [face("Noto Sans JP", SANS), face("Noto Serif JP", SERIF)].join("\n");

describe("rewriteFontStylesheet", () => {
  it("serves every slice from the public dir and lists the downloads", () => {
    const result = rewriteFontStylesheet(sample, "fonts/ja", 1);
    expect(result).toEqual({
      ok: true,
      css: expect.stringContaining("url(/fonts/ja/notosansjp/v54/a-b.0.woff2)"),
      files: [
        { url: SANS, path: "/fonts/ja/notosansjp/v54/a-b.0.woff2" },
        { url: SERIF, path: "/fonts/ja/notoserifjp/v30/c_d.1.woff2" },
      ],
    });
    if (result.ok) expect(result.css).not.toContain("fonts.gstatic.com");
  });

  it("strips comments", () => {
    const result = rewriteFontStylesheet(sample, "fonts/ja", 1);
    expect(result.ok && result.css).not.toContain("/*");
  });

  it("fails when a family has fewer faces than the minimum", () => {
    const result = rewriteFontStylesheet(sample, "fonts/ja", 2);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Noto Sans JP has 1") });
  });

  it("fails with no @font-face rule", () => {
    expect(rewriteFontStylesheet("body{}", "fonts/ja", 1).ok).toBe(false);
  });

  it("fails on a source off fonts.gstatic.com", () => {
    const css = face("Noto Sans JP", "https://example.com/s/notosansjp/v54/a.woff2");
    expect(rewriteFontStylesheet(css, "fonts/ja", 1).ok).toBe(false);
  });

  it("fails on a format other than woff2", () => {
    const css = face(
      "Noto Sans JP",
      "https://fonts.gstatic.com/s/notosansjp/v54/a.ttf",
      "truetype",
    );
    expect(rewriteFontStylesheet(css, "fonts/ja", 1).ok).toBe(false);
  });
});

describe("fontStylesheetUrls", () => {
  it("lists every url in order", () => {
    expect(fontStylesheetUrls(sample)).toEqual([SANS, SERIF]);
  });
});

describe("checkBuiltCss (the postbuild check)", () => {
  const langBlock =
    ':root:lang(ja){--font-body-script:"Noto Sans JP","Hiragino Sans";--font-display-loaded:"Noto Serif JP"}';

  it("passes CSS holding the :root:lang(ja) block", () => {
    expect(checkBuiltCss([{ name: "a.css", css: langBlock }])).toEqual({ ok: true });
  });

  it("fails CSS holding a Noto JP @font-face rule, next/font's renaming included", () => {
    const nextFont = "@font-face{font-family:__Noto_Sans_JP_5a1b;src:url(/_next/a.woff2)}";
    const google = "@font-face { font-family: 'Noto Serif JP'; src: url(x.woff2) }";
    const selfHosted = "@font-face{font-family:X;src:url(/fonts/ja/x/v1/a.woff2)}";
    expect(checkBuiltCss([{ name: "a.css", css: nextFont }]).ok).toBe(false);
    expect(checkBuiltCss([{ name: "b.css", css: google }]).ok).toBe(false);
    expect(checkBuiltCss([{ name: "c.css", css: selfHosted }]).ok).toBe(false);
  });

  // Spec 0051 AC-10: the same check for the Noto KR fonts.
  it("passes CSS holding a :root:lang(ko) block that names Noto Sans KR in a variable", () => {
    const koBlock =
      ':root:lang(ko){--font-body-script:"Noto Sans KR","Apple SD Gothic Neo";--font-display-loaded:"Noto Serif KR"}';
    expect(checkBuiltCss([{ name: "a.css", css: koBlock }])).toEqual({ ok: true });
  });

  it("fails CSS holding a Noto KR @font-face rule, next/font's renaming included", () => {
    const google = "@font-face { font-family: 'Noto Sans KR'; src: url(x.woff2) }";
    const nextFont = "@font-face{font-family:__Noto_Serif_KR_9c2d;src:url(/_next/a.woff2)}";
    const selfHosted = "@font-face{font-family:X;src:url(/fonts/ko/x/v1/a.woff2)}";
    expect(checkBuiltCss([{ name: "a.css", css: google }]).ok).toBe(false);
    expect(checkBuiltCss([{ name: "b.css", css: nextFont }]).ok).toBe(false);
    expect(checkBuiltCss([{ name: "c.css", css: selfHosted }]).ok).toBe(false);
  });

  it("names the offending files", () => {
    const result = checkBuiltCss([
      { name: "ok.css", css: langBlock },
      { name: "bad.css", css: "@font-face{font-family:'Noto Sans JP'}" },
    ]);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("bad.css") });
    expect(!result.ok && result.error).not.toContain("ok.css");
  });

  it("fails an empty file list", () => {
    expect(checkBuiltCss([]).ok).toBe(false);
  });
});
