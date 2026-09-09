import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HomePageClient } from "@/homepage/home-page-client";

const DEFAULT_DESCRIPTION =
  "Browse cocktail and mocktail recipes picked for you: drink ideas from your pantry, recommendations, and popular drinks by region.";

export const metadata: Metadata = {
  description: DEFAULT_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Bartending App",
    description: DEFAULT_DESCRIPTION,
    url: "/",
  },
};

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  if (query) {
    redirect(`/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <main className="flex flex-1 flex-col">
      <HomePageClient />
    </main>
  );
}
