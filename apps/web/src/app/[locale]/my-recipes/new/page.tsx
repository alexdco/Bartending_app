import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SubmitRecipePageClient } from "@/submissions/submit-recipe-page-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("submissions");
  return { title: t("submitMetaTitle"), robots: { index: false } };
}

export default function SubmitRecipePage() {
  return (
    <main className="flex flex-1 flex-col">
      <SubmitRecipePageClient />
    </main>
  );
}
