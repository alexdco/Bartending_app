import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchAdminRecipeDetail, isAdmin } from "@bartendingapp/shared";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "@/i18n/navigation";
import { Text } from "@/components/text";
import { AdminNav } from "@/admin/admin-nav";
import { AdminRecipeForm } from "@/admin/admin-recipe-form";
import { AdminRecipeReset } from "@/admin/admin-recipe-reset";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("editRecipeMetaTitle") };
}

export default async function EditAdminRecipePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
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
    return;
  }

  const recipe = await fetchAdminRecipeDetail(supabase, id);

  if (!recipe) {
    notFound();
  }

  const t = await getTranslations("admin");
  const isDeleted = recipe.deletedAt !== null;
  // Spec 0056 AC-6: Reset shows only for a locked catalog recipe. The loader
  // returns a deleted recipe only in that case (AC-7).
  const canReset = recipe.source === "catalog" && recipe.adminLockedAt !== null;

  return (
    <main className="flex flex-1 flex-col gap-four p-six">
      <Text variant="display" as="h1">
        {t("editRecipe")}
      </Text>
      <AdminNav />
      {isDeleted && (
        <Text variant="bodySmall" role="status">
          {t("deletedRecipeNotice", { name: recipe.name })}
        </Text>
      )}
      {recipe.changedUpstream && (
        <Text variant="bodySmall" role="status">
          {t("changedUpstreamNotice")}
        </Text>
      )}
      {canReset && <AdminRecipeReset recipeId={recipe.id} isDeleted={isDeleted} />}
      {!isDeleted && <AdminRecipeForm existingRecipe={recipe} />}
    </main>
  );
}
