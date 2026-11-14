import type { Metadata, Viewport } from "next";
import {
  Fraunces,
  Inter,
  Lora,
  Noto_Sans_Devanagari,
  Noto_Serif_Devanagari,
} from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  AGE_GATE_EXEMPT_PATTERN,
  AGE_CONFIRMED_KEY,
  AGE_DENIED_KEY,
  AGE_GATE_VERSION,
  BRAND_NAME,
  colors,
  isLaunchedLocale,
  LOCALE_HREFLANG,
} from "@bartendingapp/shared";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/site-url";
import {
  BODY_SCRIPT_FONT_BY_LOCALE,
  DISPLAY_FONT_BY_LOCALE,
  SCRIPT_FONT_STYLESHEET_BY_LOCALE,
  type BodyScriptFont,
  type DisplayFont,
} from "@/lib/display-font";
import "../globals.css";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { MAIN_CONTENT_ID } from "@/components/main-content";
import { SkipLink } from "@/components/skip-link";
import { Providers } from "./providers";

const fraunces = Fraunces({
  variable: "--font-display-loaded",
  subsets: ["latin"],
  display: "swap",
});

// Russian headings (spec 0047 AC-10). Not preloaded, so only pages that apply
// its class ever download it.
const lora = Lora({
  variable: "--font-display-loaded",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: false,
});

// Hindi headings, brand wordmark included (spec 0048 AC-10). One weight; a
// 700 on /hi is synthesized from it. Not preloaded, like Lora.
const notoSerifDevanagari = Noto_Serif_Devanagari({
  variable: "--font-display-loaded",
  subsets: ["devanagari", "latin"],
  weight: ["600"],
  display: "swap",
  preload: false,
});

const DISPLAY_FONTS: Record<DisplayFont, { readonly variable: string }> = {
  fraunces,
  lora,
  notoSerifDevanagari,
  // No class: the /ja stylesheet (SCRIPT_FONT_STYLESHEET_BY_LOCALE) and the
  // :root:lang(ja) block in globals.css supply Noto Serif JP (spec 0050 AC-11).
  notoSerifJp: { variable: "" },
  // No class: the /ko stylesheet and the :root:lang(ko) block supply Noto
  // Serif KR (spec 0051 AC-10).
  notoSerifKr: { variable: "" },
  // The /zh stylesheet and :root:lang(zh-Hans) supply Noto Serif SC (spec 0052 AC-10).
  notoSerifSc: { variable: "" },
};

// Devanagari body text on /hi, after Inter in the :lang(hi) --font-body, so
// Latin characters keep Inter (spec 0048 AC-10). Not preloaded.
const notoSansDevanagari = Noto_Sans_Devanagari({
  variable: "--font-body-script",
  subsets: ["devanagari"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
});

const BODY_SCRIPT_FONT_CLASS: Record<BodyScriptFont, string> = {
  none: "",
  notoSansDevanagari: notoSansDevanagari.variable,
  // No class: the /ja stylesheet and :root:lang(ja) supply Noto Sans JP.
  notoSansJp: "",
  // No class: the /ko stylesheet and :root:lang(ko) supply Noto Sans KR (spec 0051 AC-10).
  notoSansKr: "",
  // The /zh stylesheet and :root:lang(zh-Hans) supply Noto Sans SC (spec 0052 AC-10).
  notoSansSc: "",
};

const inter = Inter({
  variable: "--font-body-loaded",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale,
    namespace: "home",
  });

  return {
    metadataBase: new URL(SITE_URL),
    title: { template: `%s | ${BRAND_NAME}`, default: t("siteTitle") },
    description: t("siteDescription"),
    applicationName: BRAND_NAME,
    openGraph: { siteName: BRAND_NAME },
    // Crawlers must reach an unlaunched locale to see this (spec 0045 AC-7).
    ...(isLaunchedLocale(locale) ? {} : { robots: { index: false } }),
  };
}

export function generateViewport(): Viewport {
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: colors.light.bg },
      { media: "(prefers-color-scheme: dark)", color: colors.dark.bg },
    ],
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("theme-preference");
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  } catch (e) {}
})();
`;

// Decides the age gate before paint (spec 0037, AC-9): sets html[data-age]
// to exempt, ok, denied, or ask, which globals.css reads to show the gate.
// Falls back to ask when storage throws (AC-16).
const ageGateInitScript = `
(function () {
  var state = "ask";
  try {
    if (new RegExp(${JSON.stringify(AGE_GATE_EXEMPT_PATTERN.source)}).test(location.pathname)) {
      state = "exempt";
    } else if (localStorage.getItem("${AGE_CONFIRMED_KEY}") === "${AGE_GATE_VERSION}") {
      state = "ok";
    } else if (sessionStorage.getItem("${AGE_DENIED_KEY}") === "1") {
      state = "denied";
    }
  } catch (e) {}
  document.documentElement.setAttribute("data-age", state);
})();
`;

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();
  const scriptFontStylesheet = SCRIPT_FONT_STYLESHEET_BY_LOCALE[locale];

  return (
    <html
      lang={LOCALE_HREFLANG[locale]}
      className={`${DISPLAY_FONTS[DISPLAY_FONT_BY_LOCALE[locale]].variable} ${inter.variable} ${BODY_SCRIPT_FONT_CLASS[BODY_SCRIPT_FONT_BY_LOCALE[locale]]}`.trim()}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: ageGateInitScript }} />
        {scriptFontStylesheet && (
          // A static, self hosted font stylesheet linked for its locale only,
          // so no other locale downloads its CJK @font-face rules (spec 0050
          // AC-11). Render blocking on purpose: headings never flash in the
          // wrong family before the rules arrive.
          <link rel="stylesheet" href={scriptFontStylesheet} />
        )}
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <SkipLink />
            <SiteNav />
            {/* Skip link target (spec 0038 AC-12). Pages render their own <main>,
                so this is a plain wrapper; it is focused only programmatically,
                never by Tab, so its outline is suppressed. */}
            <div id={MAIN_CONTENT_ID} tabIndex={-1} className="flex flex-1 flex-col outline-none">
              {children}
            </div>
            <SiteFooter />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
