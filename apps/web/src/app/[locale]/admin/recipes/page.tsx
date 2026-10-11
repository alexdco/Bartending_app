import { isAdmin } from "@bartendingapp/shared";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "@/i18n/navigation";
import { Text } from "@/components/text";
import { AdminNav } from "@/admin/admin-nav";
import { AdminRecipeList } from "@/admin/admin-recipe-list";

export default async function AdminRecipesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    redirect({ href: "/", locale });
    return;
  }

  const admin = await isAdmin(supabase, user.id);

  if (!admin) {
    redirect({ href: "/", locale });
  }

  const t = await getTranslations("admin");

  return (
    <main className="flex flex-1 flex-col gap-four p-six">
      <Text variant="display" as="h1">
        {t("recipes")}
      </Text>
      <AdminNav />
      <AdminRecipeList />
    </main>
  );
}
