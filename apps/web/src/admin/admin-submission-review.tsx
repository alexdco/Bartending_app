"use client";

import { useTranslations } from "next-intl";
import {
  buildRecipeSlugPath,
  type AdminSubmissionDetail,
  type ApproveSubmissionResult,
} from "@bartendingapp/shared";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import {
  useAdminRecipeSubmission,
  useApproveRecipeSubmission,
} from "@/submissions/use-submissions";
import { AdminRecipeForm, type AdminRecipeSubmitOutcome } from "./admin-recipe-form";
import { ScreeningBadges } from "./admin-submissions";

type ReviewTranslator = ReturnType<typeof useTranslations<"admin.recipeSubmissions">>;

/**
 * One submission: the author's original fields, screening, similar catalog
 * recipes, and the spec 0030 form prefilled for Approve (spec 0064 AC-11,
 * AC-14, AC-15).
 */
export function AdminSubmissionReview({ submissionId }: { submissionId: string }) {
  const t = useTranslations("admin.recipeSubmissions");
  const tCommon = useTranslations("common");
  const { data, error, isPending, refetch } = useAdminRecipeSubmission(submissionId);

  if (error) {
    return (
      <EmptyState
        title={tCommon("somethingWentWrong")}
        description={t("loadFailed")}
        action={<Button onClick={() => refetch()}>{tCommon("retry")}</Button>}
      />
    );
  }

  if (isPending) {
    return (
      <div className="flex justify-center py-four">
        <Spinner label={t("loading")} />
      </div>
    );
  }

  if (!data) {
    return <EmptyState title={t("notFound")} />;
  }

  return (
    <div className="flex flex-col gap-six">
      <Link
        href="/admin/submissions"
        className="self-start text-label underline underline-offset-4"
      >
        {t("backToList")}
      </Link>
      <SubmissionOriginal submission={data} />
      {data.status === "pending" ? (
        <ApprovePanel submission={data} />
      ) : (
        <Text variant="body" muted>
          {t("alreadyReviewed")}
        </Text>
      )}
    </div>
  );
}

function SubmissionOriginal({ submission }: { submission: AdminSubmissionDetail }) {
  const t = useTranslations("admin.recipeSubmissions");
  const notScreened =
    submission.textScreening !== "clear" && submission.textScreening !== "flagged";

  // Every author string renders as plain text, never HTML or markdown (invariant 8).
  return (
    <section className="flex flex-col gap-three rounded-medium border border-border p-four">
      <Text variant="heading" as="h2">
        {t("originalHeading")}
      </Text>
      <Text variant="bodySmall" muted>
        {submission.authorDisplayName ?? t("noDisplayName")} · {submission.locale.toUpperCase()}
      </Text>

      <ScreeningBadges text={submission.textScreening} photo={submission.photoScreening} />
      {notScreened && submission.status === "pending" && (
        <Text variant="bodySmall" role="note" className="text-danger">
          {t("notScreenedWarning")}
        </Text>
      )}
      {submission.screeningNote && (
        <div className="flex flex-col gap-half">
          <Text variant="label">{t("screeningNote")}</Text>
          <Text variant="bodySmall" className="whitespace-pre-line break-words">
            {submission.screeningNote}
          </Text>
        </div>
      )}

      <Field label={t("fieldName")} value={submission.name} />
      <div className="flex flex-col gap-half">
        <Text variant="label">{t("fieldIngredients")}</Text>
        <ul className="list-disc pl-five">
          {submission.ingredients.map((ingredient, index) => (
            <li key={index}>
              <Text variant="body" as="span" className="break-words">
                {ingredient.measure ? `${ingredient.measure} ` : ""}
                {ingredient.name}
              </Text>
            </li>
          ))}
        </ul>
      </div>
      <Field label={t("fieldInstructions")} value={submission.instructions} />
      {submission.glass && <Field label={t("fieldGlass")} value={submission.glass} />}
      {submission.note && <Field label={t("fieldNote")} value={submission.note} />}

      <div className="flex flex-col gap-half">
        <Text variant="label">{t("similarHeading")}</Text>
        {submission.similarRecipes.length === 0 ? (
          <Text variant="bodySmall" muted>
            {t("noSimilar")}
          </Text>
        ) : (
          <ul className="flex flex-col gap-one">
            {submission.similarRecipes.map((recipe) => (
              <li key={recipe.id}>
                <Link
                  href={`/recipes/${buildRecipeSlugPath(recipe.id, recipe.name, recipe.baseName)}`}
                  className="text-body underline underline-offset-4"
                  target="_blank"
                >
                  {recipe.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-half">
      <Text variant="label">{label}</Text>
      <Text variant="body" className="whitespace-pre-line break-words">
        {value}
      </Text>
    </div>
  );
}

function approveOutcome(
  t: ReviewTranslator,
  error: NonNullable<ApproveSubmissionResult["error"]>,
): AdminRecipeSubmitOutcome {
  switch (error.reason) {
    case "validation":
      return { errors: error.errors };
    case "stale":
      return { message: t("errorStale") };
    case "not_admin":
      return { message: t("errorNotAdmin") };
    case "not_found":
      return { message: t("notFound") };
    case "rejected":
    case "request_failed":
      return { message: t("approveFailed", { message: error.message }) };
    case "notes_failed":
      return { message: t("approveNotesFailed", { message: error.message }) };
  }
}

function ApprovePanel({ submission }: { submission: AdminSubmissionDetail }) {
  const t = useTranslations("admin.recipeSubmissions");
  const router = useRouter();
  const approve = useApproveRecipeSubmission();

  return (
    <section className="flex flex-col gap-four">
      <Text variant="heading" as="h2">
        {t("reviewHeading")}
      </Text>
      <Text variant="bodySmall" muted>
        {t("reviewHint")}
      </Text>
      <AdminRecipeForm
        prefill={{
          name: submission.name,
          instructions: submission.instructions,
          glass: submission.glass,
          alcoholicStatus: submission.alcoholicStatus,
          ingredients: submission.ingredients,
          // AC-11: the note maps to the bartender tip.
          bartenderTip: submission.note,
        }}
        submitLabel={t("approve")}
        submittingLabel={t("approving")}
        onSubmitValues={async (values) => {
          const result = await approve.mutateAsync({
            submissionId: submission.id,
            expectedUpdatedAt: submission.updatedAt,
            keepPhoto: false,
            values,
          });
          if (result.error) {
            return approveOutcome(t, result.error);
          }
          router.push("/admin/submissions");
          return null;
        }}
      />
    </section>
  );
}
