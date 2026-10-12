import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FavoritesPageClient } from "@/favorites/favorites-page-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("favorites");
  return { title: t("title") };
}

export default function FavoritesPage() {
  return (
    <main className="flex flex-1 flex-col">
      <FavoritesPageClient />
    </main>
  );
}
