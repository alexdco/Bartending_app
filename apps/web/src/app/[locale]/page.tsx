import type { Metadata } from "next";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { localizedPath, SUPPORTED_LOCALES, type Locale } from "@bartendingapp/shared";
import { HomePageClient } from "@/homepage/home-page-client";

const DEFAULT_DESCRIPTION =
  "Browse cocktail and mocktail recipes picked for you: drink ideas from your pantry, recommendations, and popular drinks by region.";

export async function generateMetadata(): Promise<Metadata> {
  const canonicalPath = localizedPath((await getLocale()) as Locale, "/");

  return {
    description: DEFAULT_DESCRIPTION,
    alternates: {
      canonical: canonicalPath,
      languages: Object.fromEntries(
        SUPPORTED_LOCALES.map((locale) => [locale, localizedPath(locale, "/")]),
      ),
    },
    openGraph: {
      title: "Bartending App",
      description: DEFAULT_DESCRIPTION,
      url: canonicalPath,
    },
  };
}

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  if (query) {
    redirect({
      href: `/search?q=${encodeURIComponent(query)}`,
      locale: (await getLocale()) as Locale,
    });
  }

  return (
    <main className="flex flex-1 flex-col">
      <HomePageClient />
    </main>
  );
}
