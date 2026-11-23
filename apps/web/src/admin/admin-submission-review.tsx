"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import {
  buildRecipeSlugPath,
  SUBMISSION_REJECTION_REASON_MAX_LENGTH,
  type AdminSubmissionDetail,
  type ApproveSubmissionResult,
  type DraftEnglishError,
  type EnglishDraft,
  type RejectSubmissionError,
  type ScreeningResult,
} from "@bartendingapp/shared";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import {
  useAdminRecipeSubmission,
  useApproveRecipeSubmission,
  useDraftSubmissionEnglish,
  useRejectRecipeSubmission,
  useSetSubmissionBlock,
  useSubmissionPhotoUrls,
} from "@/submissions/use-submissions";
import { AdminRecipeForm, type AdminRecipeSubmitOutcome } from "./admin-recipe-form";
import { ScreeningBadges } from "./admin-submissions";

type ReviewTranslator = ReturnType<typeof useTranslations<"admin.recipeSubmissions">>;

const PHOTO_SIZE = 240;

/**
 * One submission: the author's original fields, screening, photo, similar
 * catalog recipes, and the spec 0030 form prefilled for Approve (spec 0064
 * AC-11, AC-12, AC-14, AC-15).
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
      {data.status === "pending" ? (
        // Remounts with the new token after a reload, which also drops a draft.
        <PendingReview key={data.updatedAt} submission={data} onReload={() => refetch()} />
      ) : (
        <>
          <SubmissionOriginal submission={data} />
          <Text variant="body" muted>
            {t("alreadyReviewed")}
          </Text>
        </>
      )}
      <BlockAuthorControl submissionId={data.id} blocked={data.authorBlocked} />
    </div>
  );
}

/**
 * AC-18: "Block from submitting", on every review screen whatever the status.
 * It applies to the author, so their pending submissions stay in the queue.
 */
function BlockAuthorControl({ submissionId, blocked }: { submissionId: string; blocked: boolean }) {
  const t = useTranslations("admin.recipeSubmissions");
  const setBlock = useSetSubmissionBlock();
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: boolean) {
    setError(null);
    const result = await setBlock.mutateAsync({ submissionId, blocked: next });
    if (result.error) {
      setError(
        t("blockFailed", {
          message:
            result.error.reason === "request_failed" ? result.error.message : result.error.reason,
        }),
      );
    }
  }

  return (
    <section className="flex flex-col gap-two border-t border-border pt-four">
      <label className="flex items-center gap-two text-label font-medium text-text">
        <input
          type="checkbox"
          checked={blocked}
          disabled={setBlock.isPending}
          aria-describedby={error ? "block-author-hint block-author-error" : "block-author-hint"}
          onChange={(event) => void handleChange(event.target.checked)}
        />
        {t("blockLabel")}
      </label>
      <Text id="block-author-hint" variant="bodySmall" muted>
        {t("blockHint")}
      </Text>
      {error && (
        <span id="block-author-error" role="alert" className="text-body-small text-danger">
          {error}
        </span>
      )}
    </section>
  );
}

/** AC-15: screening that hasn't produced clear or flagged for every part. */
function isUnscreened(submission: AdminSubmissionDetail): boolean {
  const done = (result: ScreeningResult | null) => result === "clear" || result === "flagged";
  return (
    !done(submission.textScreening) ||
    (submission.photoPath !== null && !done(submission.photoScreening))
  );
}

const isFlagged = (submission: AdminSubmissionDetail) =>
  submission.textScreening === "flagged" || submission.photoScreening === "flagged";

function SubmissionOriginal({ submission }: { submission: AdminSubmissionDetail }) {
  const t = useTranslations("admin.recipeSubmissions");
  const { data: photoUrls, isPending: photoPending } = useSubmissionPhotoUrls(
    [submission.photoPath],
    "hero",
  );
  const photoUrl = submission.photoPath ? (photoUrls?.[submission.photoPath] ?? null) : null;
  const flagged = isFlagged(submission);

  // Every author string and the screening note render as plain text, never
  // HTML or markdown (invariant 8).
  return (
    <section className="flex flex-col gap-three rounded-medium border border-border p-four">
      <Text variant="heading" as="h2">
        {t("originalHeading")}
      </Text>
      <Text variant="bodySmall" muted>
        {submission.authorDisplayName ?? t("noDisplayName")} · {submission.locale.toUpperCase()}
      </Text>

      <ScreeningBadges text={submission.textScreening} photo={submission.photoScreening} />
      {isUnscreened(submission) && submission.status === "pending" && (
        <Text variant="bodySmall" role="note" className="text-danger">
          {t("notScreenedWarning")}
        </Text>
      )}
      {submission.screeningNote && (
        <div
          className={`flex flex-col gap-half ${
            flagged ? "rounded-medium border-2 border-danger p-three" : ""
          }`}
          role={flagged ? "note" : undefined}
        >
          <Text variant="label" className={flagged ? "text-danger" : undefined}>
            {flagged ? t("screeningFlaggedNote") : t("screeningNote")}
          </Text>
          <Text variant="bodySmall" className="whitespace-pre-line break-words">
            {submission.screeningNote}
          </Text>
        </div>
      )}

      {submission.photoPath && (
        <div className="flex flex-col gap-half">
          <Text variant="label">{t("fieldPhoto")}</Text>
          <div
            className="relative overflow-hidden rounded-small border border-border bg-surface-selected"
            style={{ width: PHOTO_SIZE, height: PHOTO_SIZE }}
          >
            {photoUrl ? (
              // A signed URL: never through the image optimizer.
              <Image
                src={photoUrl}
                alt={t("photoAlt")}
                fill
                sizes={`${PHOTO_SIZE}px`}
                unoptimized
                className="object-cover"
              />
            ) : (
              <span className="flex h-full items-center justify-center p-two text-center text-body-small text-text-muted">
                {photoPending ? t("photoLoading") : t("photoUnavailable")}
              </span>
            )}
          </div>
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
    case "photo_copy_failed":
      return { message: t("photoCopyFailed") };
    case "rejected":
    case "request_failed":
      return { message: t("approveFailed", { message: error.message }) };
    case "notes_failed":
      return { message: t("approveNotesFailed", { message: error.message }) };
  }
}

/**
 * A pending submission: the original, then approve and reject, both sending
 * the updated_at the admin loaded. A stale result (AC-14) shows a reload
 * action. Once an English draft fills the form (AC-12), the original sits
 * beside it on wide screens so the two can be compared.
 */
function PendingReview({
  submission,
  onReload,
}: {
  submission: AdminSubmissionDetail;
  onReload: () => void;
}) {
  const t = useTranslations("admin.recipeSubmissions");
  const [isStale, setIsStale] = useState(false);
  const [draft, setDraft] = useState<EnglishDraft | null>(null);

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
      <div
        className={
          draft
            ? "flex flex-col gap-six lg:grid lg:grid-cols-2 lg:items-start"
            : "flex flex-col gap-six"
        }
      >
        <div className={draft ? "lg:sticky lg:top-four" : undefined}>
          <SubmissionOriginal submission={submission} />
        </div>
        <ApprovePanel
          submission={submission}
          draft={draft}
          onDraft={setDraft}
          onStale={() => setIsStale(true)}
        />
      </div>
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

function draftErrorMessage(t: ReviewTranslator, error: DraftEnglishError): string {
  switch (error.reason) {
    case "not_admin":
      return t("errorNotAdmin");
    case "not_found":
      return t("notFound");
    case "model_failed":
    case "request_failed":
      return t("draftEnglishFailed");
  }
}

/** AC-12: an English draft for a non English submission; nothing saves until Approve. */
function DraftEnglishControl({
  submission,
  draft,
  onDraft,
}: {
  submission: AdminSubmissionDetail;
  draft: EnglishDraft | null;
  onDraft: (draft: EnglishDraft | null) => void;
}) {
  const t = useTranslations("admin.recipeSubmissions");
  const draftEnglish = useDraftSubmissionEnglish();
  const [error, setError] = useState<string | null>(null);

  async function handleDraft() {
    setError(null);
    const result = await draftEnglish.mutateAsync(submission.id);
    if (result.error) {
      setError(draftErrorMessage(t, result.error));
      return;
    }
    onDraft(result.data);
  }

  return (
    <div className="flex flex-col gap-two rounded-medium border border-border p-three">
      <Text variant="bodySmall" muted>
        {draft ? t("draftEnglishApplied") : t("draftEnglishHint")}
      </Text>
      <div className="flex flex-wrap gap-two">
        <Button
          type="button"
          variant="secondary"
          disabled={draftEnglish.isPending}
          onClick={handleDraft}
        >
          {draftEnglish.isPending
            ? t("draftingEnglish")
            : draft
              ? t("draftEnglishAgain")
              : t("draftEnglish")}
        </Button>
        {draft && (
          <Button type="button" variant="secondary" onClick={() => onDraft(null)}>
            {t("useOriginal")}
          </Button>
        )}
      </div>
      {draftEnglish.isPending && (
        <Text variant="bodySmall" muted role="status">
          {t("draftingEnglishStatus")}
        </Text>
      )}
      {error && (
        <Text variant="bodySmall" role="alert" className="text-danger">
          {error}
        </Text>
      )}
    </div>
  );
}

function ApprovePanel({
  submission,
  draft,
  onDraft,
  onStale,
}: {
  submission: AdminSubmissionDetail;
  draft: EnglishDraft | null;
  onDraft: (draft: EnglishDraft | null) => void;
  onStale: () => void;
}) {
  const t = useTranslations("admin.recipeSubmissions");
  const router = useRouter();
  const approve = useApproveRecipeSubmission();
  // AC-11: keep or drop the photo; kept by default when there is one.
  const [keepPhoto, setKeepPhoto] = useState(submission.photoPath !== null);

  const source = draft ?? submission;

  return (
    <section className="flex flex-col gap-four">
      <Text variant="heading" as="h2">
        {t("reviewHeading")}
      </Text>
      <Text variant="bodySmall" muted>
        {t("reviewHint")}
      </Text>
      {submission.locale !== "en" && (
        <DraftEnglishControl submission={submission} draft={draft} onDraft={onDraft} />
      )}
      {submission.photoPath && (
        <label className="flex items-center gap-two text-body text-text">
          <input
            type="checkbox"
            checked={keepPhoto}
            onChange={(event) => setKeepPhoto(event.target.checked)}
            className="h-four w-four"
          />
          {t("keepPhoto")}
        </label>
      )}
      <AdminRecipeForm
        // A new or cleared draft refills the form from scratch.
        key={draft ? JSON.stringify(draft) : "original"}
        prefill={{
          name: source.name,
          instructions: source.instructions,
          glass: source.glass,
          alcoholicStatus: submission.alcoholicStatus,
          ingredients: source.ingredients,
          // AC-11: the note maps to the bartender tip.
          bartenderTip: source.note,
        }}
        submitLabel={t("approve")}
        submittingLabel={t("approving")}
        onSubmitValues={async (values) => {
          const result = await approve.mutateAsync({
            submissionId: submission.id,
            expectedUpdatedAt: submission.updatedAt,
            keepPhoto: keepPhoto && submission.photoPath !== null,
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
