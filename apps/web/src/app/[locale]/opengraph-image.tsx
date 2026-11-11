import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { createTranslator, hasLocale } from "next-intl";
import { BRAND_NAME, colors } from "@bartendingapp/shared";
import { routing } from "@/i18n/routing";
import { OG_CARD_ID, OG_CARD_SIZE, SHARE_IMAGE_LOCALE } from "@/lib/open-graph";
import { DISPLAY_FONT_BY_LOCALE, DISPLAY_FONT_FILES, isShareImageFont } from "@/lib/display-font";

// The default share card for every page without its own image (spec 0037,
// AC-5): the glass mark, the brand, and the translated tagline on charcoal.

const CONTENT_TYPE = "image/png";
const { bg, accent, text, textMuted } = colors.dark;

// Image generation runs at build time with no request, where next-intl's
// request config can't run, so the tagline is read straight from messages.
// Resolved once through SHARE_IMAGE_LOCALE, so the tagline, font, alt, and
// metadata all agree (spec 0048 AC-19: /hi shares the English card).
function ogLocale(requested: string) {
  return SHARE_IMAGE_LOCALE[
    hasLocale(routing.locales, requested) ? requested : routing.defaultLocale
  ];
}

async function ogTagline(requested: string): Promise<string> {
  const locale = ogLocale(requested);
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  return createTranslator({ locale, messages, namespace: "home" })("ogTagline");
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// A static `alt` export can't be translated, so the card's metadata comes
// from here, which gives it a per locale alt (`home.ogTagline`).
export async function generateImageMetadata({ params }: { params: { locale: string } }) {
  return [
    {
      id: OG_CARD_ID,
      alt: await ogTagline(params.locale),
      size: OG_CARD_SIZE,
      contentType: CONTENT_TYPE,
    },
  ];
}

export default async function OpenGraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const tagline = await ogTagline(locale);
  // The locale's heading font, so a Cyrillic tagline has its glyphs (spec 0047 AC-10).
  const font = DISPLAY_FONT_BY_LOCALE[ogLocale(locale)];
  if (!isShareImageFont(font)) {
    throw new Error(`No bundled share image font for "${locale}"; map it in SHARE_IMAGE_LOCALE`);
  }
  const display = DISPLAY_FONT_FILES[font];
  const fontData = await readFile(join(process.cwd(), "src/assets/fonts", display.file));

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 96,
        background: bg,
        borderBottom: `16px solid ${accent}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        <svg width="128" height="128" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 4h16l-6.5 8.5V18h3a1 1 0 0 1 0 2H7.5a1 1 0 0 1 0-2h3v-5.5L4 4Z"
            fill={accent}
          />
          <path d="M7.5 6h9" stroke={bg} strokeWidth="1.25" strokeLinecap="round" />
        </svg>
        <div style={{ fontFamily: display.name, fontSize: 112, color: text, letterSpacing: -2 }}>
          {BRAND_NAME}
        </div>
      </div>
      <div style={{ marginTop: 40, fontSize: 48, color: textMuted, fontFamily: display.name }}>
        {tagline}
      </div>
    </div>,
    {
      ...OG_CARD_SIZE,
      fonts: [{ name: display.name, data: fontData, style: "normal", weight: 600 }],
    },
  );
}
