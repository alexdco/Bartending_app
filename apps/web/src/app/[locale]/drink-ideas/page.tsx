import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DrinkIdeasPageClient } from "@/drink-ideas/drink-ideas-page-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("drinkIdeas");
  return { title: t("title"), description: t("metaDescription") };
}

export default function DrinkIdeasPage() {
  return (
    <main className="flex flex-1 flex-col">
      <DrinkIdeasPageClient />
    </main>
  );
}
