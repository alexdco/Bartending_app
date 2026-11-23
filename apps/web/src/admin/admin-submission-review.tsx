"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  buildRecipeSlugPath,
  SUBMISSION_REJECTION_REASON_MAX_LENGTH,
  type AdminSubmissionDetail,
  type ApproveSubmissionResult,
  type RejectSubmissionError,
} from "@bartendingapp/shared";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import {
  useAdminRecipeSubmission,
  useApproveRecipeSubmission,
  useRejectRecipeSubmission,
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
        <ReviewActions key={data.updatedAt} submission={data} onReload={() => refetch()} />
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

/**
 * Approve and reject, both sending the updated_at the admin loaded. A stale
 * result (AC-14) shows a reload action; reloading remounts this with the new
 * token.
 */
function ReviewActions({
  submission,
  onReload,
}: {
  submission: AdminSubmissionDetail;
  onReload: () => void;
}) {
  const t = useTranslations("admin.recipeSubmissions");
  const [isStale, setIsStale] = useState(false);

  return (
    <div className="flex flex-col gap-six">
      {isStale && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-three rounded-medium border border-danger p-three"
        >
          <Text variant="body" className="text-danger">
            {t("errorStale")}
          </Text>
          <Button variant="secondary" onClick={onReload}>
            {t("reload")}
          </Button>
        </div>
      )}
      <ApprovePanel submission={submission} onStale={() => setIsStale(true)} />
      <RejectPanel submission={submission} onStale={() => setIsStale(true)} />
    </div>
  );
}

function rejectErrorMessage(t: ReviewTranslator, error: RejectSubmissionError): string {
  switch (error.reason) {
    case "validation":
      return error.error === "too_long"
        ? t("rejectReasonTooLong", { max: SUBMISSION_REJECTION_REASON_MAX_LENGTH })
        : t("rejectReasonRequired");
    case "stale":
      return t("errorStale");
    case "not_admin":
      return t("errorNotAdmin");
    case "not_found":
      return t("notFound");
    case "request_failed":
      return t("rejectFailed", { message: error.message });
  }
}

/** AC-13: reject with a reason the author will see. */
function RejectPanel({
  submission,
  onStale,
}: {
  submission: AdminSubmissionDetail;
  onStale: () => void;
}) {
  const t = useTranslations("admin.recipeSubmissions");
  const router = useRouter();
  const reject = useRejectRecipeSubmission();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleReject(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const result = await reject.mutateAsync({
      submissionId: submission.id,
      reason,
      expectedUpdatedAt: submission.updatedAt,
    });
    if (result.error) {
      if (result.error.reason === "stale") onStale();
      setError(rejectErrorMessage(t, result.error));
      return;
    }
    router.push("/admin/submissions");
  }

  return (
    <section className="flex flex-col gap-three rounded-medium border border-border p-four">
      <Text variant="heading" as="h2">
        {t("rejectHeading")}
      </Text>
      <form onSubmit={handleReject} className="flex flex-col gap-three" noValidate>
        <div className="flex flex-col gap-one">
          <label htmlFor="reject-reason" className="text-label font-medium text-text">
            {t("rejectReason")}
          </label>
          <Text id="reject-reason-hint" variant="bodySmall" muted>
            {t("rejectReasonHint")}
          </Text>
          <textarea
            id="reject-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={SUBMISSION_REJECTION_REASON_MAX_LENGTH}
            rows={3}
            aria-describedby={
              error ? "reject-reason-hint reject-reason-error" : "reject-reason-hint"
            }
            aria-invalid={error ? true : undefined}
            className={`rounded-small border bg-surface px-three py-two text-body text-text ${
              error ? "border-danger" : "border-border"
            }`}
          />
          {error && (
            <span id="reject-reason-error" role="alert" className="text-body-small text-danger">
              {error}
            </span>
          )}
        </div>
        <Button
          type="submit"
          variant="secondary"
          disabled={reject.isPending}
          className="self-start"
        >
          {reject.isPending ? t("rejecting") : t("reject")}
        </Button>
      </form>
    </section>
  );
}

function ApprovePanel({
  submission,
  onStale,
}: {
  submission: AdminSubmissionDetail;
  onStale: () => void;
}) {
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
            if (result.error.reason === "stale") onStale();
            return approveOutcome(t, result.error);
          }
          router.push("/admin/submissions");
          return null;
        }}
      />
    </section>
  );
}
