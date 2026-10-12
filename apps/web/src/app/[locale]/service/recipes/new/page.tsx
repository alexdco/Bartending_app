import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BarRecipeFormPageClient } from "@/service/bar-recipe-form-page-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("service");
  return { title: t("newRecipeMetaTitle") };
}

export default function BarRecipeFormPage() {
  return (
    <main className="flex flex-1 flex-col">
      <BarRecipeFormPageClient />
    </main>
  );
}
