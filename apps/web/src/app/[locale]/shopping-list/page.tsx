import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ShoppingListPageClient } from "@/shopping-list/shopping-list-page-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shoppingList");
  return { title: t("title") };
}

export default function ShoppingListPage() {
  return (
    <main className="flex flex-1 flex-col">
      <ShoppingListPageClient />
    </main>
  );
}
