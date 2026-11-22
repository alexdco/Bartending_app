import type { Metadata } from "next";
import { isAdmin } from "@bartendingapp/shared";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "@/i18n/navigation";
import { Text } from "@/components/text";
import { AdminNav } from "@/admin/admin-nav";
import { AdminSubmissionReview } from "@/admin/admin-submission-review";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("submissionReviewMetaTitle") };
}

// Spec 0064 AC-11: one submission and its Approve form.
export default async function AdminSubmissionReviewPage({
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
  }

  const t = await getTranslations("admin.recipeSubmissions");

  return (
    <main className="flex flex-1 flex-col gap-four p-six">
      <Text variant="display" as="h1">
        {t("reviewTitle")}
      </Text>
      <AdminNav />
      <AdminSubmissionReview submissionId={id} />
    </main>
  );
}
