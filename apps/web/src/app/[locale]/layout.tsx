import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
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
} from "@bartendingapp/shared";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/site-url";
import "../globals.css";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Providers } from "./providers";

const fraunces = Fraunces({
  variable: "--font-display-loaded",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-body-loaded",
  subsets: ["latin"],
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

  return (
    <html
      lang={locale}
      className={`${fraunces.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: ageGateInitScript }} />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <SiteNav />
            {children}
            <SiteFooter />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
