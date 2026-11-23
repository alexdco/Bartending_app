import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SubmitRecipePageClient } from "@/submissions/submit-recipe-page-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("submissions");
  return { title: t("editMetaTitle"), robots: { index: false } };
}

// Spec 0064 AC-6: edit and resubmit a pending or rejected submission.
export default async function EditSubmissionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="flex flex-1 flex-col">
      <SubmitRecipePageClient submissionId={id} />
    </main>
  );
}
