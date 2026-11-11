import { describe, expect, it } from "vitest";
import { normalizeHindiTypography } from "./hindiTypography";

describe("normalizeHindiTypography", () => {
  it("turns a sentence ending full stop into a danda", () => {
    expect(normalizeHindiTypography("बर्फ़ डालें. फिर हिलाएँ.")).toBe("बर्फ़ डालें। फिर हिलाएँ।");
    expect(normalizeHindiTypography("बर्फ़ डालें.\nफिर हिलाएँ.")).toBe("बर्फ़ डालें।\nफिर हिलाएँ।");
  });

  it("rewrites dotted units without dots", () => {
    expect(normalizeHindiTypography("30 मि.ली. रम")).toBe("30 मिली रम");
    expect(normalizeHindiTypography("2 सें.ली. सिरप")).toBe("2 सेली सिरप");
    expect(normalizeHindiTypography("1 ली. पानी")).toBe("1 ली पानी");
  });

  it("removes the space before a danda", () => {
    expect(normalizeHindiTypography("डालें ।")).toBe("डालें।");
  });

  it("turns a straight quote pair into curly quotes", () => {
    expect(normalizeHindiTypography('"मोहितो"')).toBe("“मोहितो”");
    expect(normalizeHindiTypography('यह "मोहितो" है.')).toBe("यह “मोहितो” है।");
  });

  it("leaves abbreviations, ellipses, pipes, decimals, URLs, and English alone", () => {
    expect(normalizeHindiTypography("डॉ. शर्मा")).toBe("डॉ. शर्मा");
    expect(normalizeHindiTypography("श्री. वर्मा")).toBe("श्री. वर्मा");
    expect(normalizeHindiTypography("रुकिए...")).toBe("रुकिए...");
    expect(normalizeHindiTypography("क | ख")).toBe("क | ख");
    expect(normalizeHindiTypography("1.5")).toBe("1.5");
    expect(normalizeHindiTypography("https://example.com/a.b")).toBe("https://example.com/a.b");
    expect(normalizeHindiTypography("Shake well. Strain.")).toBe("Shake well. Strain.");
    expect(normalizeHindiTypography('एक " बिना जोड़ी')).toBe('एक " बिना जोड़ी');
  });

  it("stores nukta letters in one NFC form", () => {
    // U+095B (ज़ as one code point) is a composition exclusion, so NFC
    // keeps ज plus the nukta sign; both spellings end up identical.
    const decomposed = "ज़";
    expect(normalizeHindiTypography("ज़")).toBe(decomposed);
    expect(normalizeHindiTypography(decomposed)).toBe(decomposed);
  });

  it("is idempotent", () => {
    const messy = 'बर्फ़ डालें । 30 मि.ली. "रम" मिलाएँ. डॉ. शर्मा कहते हैं...';
    const once = normalizeHindiTypography(messy);
    expect(once).toBe("बर्फ़ डालें। 30 मिली “रम” मिलाएँ। डॉ. शर्मा कहते हैं...");
    expect(normalizeHindiTypography(once)).toBe(once);
  });
});
