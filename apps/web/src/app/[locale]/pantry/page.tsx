import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PantryPageClient } from "@/pantry/pantry-page-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pantry");
  return { title: t("title") };
}

export default function PantryPage() {
  return (
    <main className="flex flex-1 flex-col">
      <PantryPageClient />
    </main>
  );
}
