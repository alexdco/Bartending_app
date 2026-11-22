import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MyRecipesPageClient } from "@/submissions/my-recipes-page-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("submissions");
  return { title: t("myRecipesMetaTitle"), robots: { index: false } };
}

export default function MyRecipesPage() {
  return (
    <main className="flex flex-1 flex-col">
      <MyRecipesPageClient />
    </main>
  );
}
