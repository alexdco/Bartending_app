"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  REPORT_NOTE_MAX_LENGTH,
  REPORT_REASONS,
  validateReportNote,
  type ReportContentError,
  type ReportReason,
  type ReportTarget,
} from "@bartendingapp/shared";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { useSession } from "@/auth/use-session";
import { useReportContent } from "./use-comment-mutations";

type CommentsTranslator = ReturnType<typeof useTranslations<"comments">>;

function reportErrorMessage(t: CommentsTranslator, error: ReportContentError): string {
  switch (error.reason) {
    case "already_reported":
    case "report_limit":
    case "not_found":
    case "own_content":
    case "not_signed_in":
      return t(`report.errors.${error.reason}`);
    case "invalid_input":
      return t("report.errors.invalid_input", { max: REPORT_NOTE_MAX_LENGTH });
    case "request_failed":
      return t("report.errors.generic");
  }
}

export interface ReportDialogProps {
  recipeId: string;
  /** What to report, or null when closed. */
  target: ReportTarget | null;
  onClose: () => void;
}

/**
 * Report a comment or one photo (spec 0062 AC-6 to AC-8). A native modal
 * dialog, like the photo viewer: focus trap, Escape, and focus return for
 * free. Guests see a sign in prompt instead of the form. After a report the
 * target has already left the list; the dialog stays open on the thank you.
 *
 * Mount with a `key` per target so each report starts from a blank form.
 */
export function ReportDialog({ recipeId, target, onClose }: ReportDialogProps) {
  const t = useTranslations("comments");
  const tCommon = useTranslations("common");
  const { isLinked } = useSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const report = useReportContent(recipeId);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (target && !dialog.open) dialog.showModal();
    else if (!target && dialog.open) dialog.close();
  }, [target]);

  const title = target?.kind === "photo" ? t("report.photoTitle") : t("report.commentTitle");
  const noteLength = [...note.trim()].length;

  const submit = async () => {
    if (!target || !reason) return;
    setError(null);

    if (validateReportNote(note) !== null) {
      setError(reportErrorMessage(t, { reason: "invalid_input" }));
      return;
    }

    const result = await report.mutateAsync({ target, reason, note });
    if (result.data) {
      setIsDone(true);
      return;
    }
    setError(reportErrorMessage(t, result.error));
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="report-dialog-title"
      onClose={onClose}
      className="m-auto w-[min(92vw,480px)] rounded-medium bg-surface p-0 text-text backdrop:bg-black/60"
    >
      {target && (
        <div className="flex flex-col gap-three p-four">
          <Text variant="subheading" as="h2" id="report-dialog-title">
            {title}
          </Text>

          {!isLinked ? (
            <>
              <Text variant="body">
                {t.rich("report.signIn", {
                  link: (chunks) => (
                    <Link href="/account" className="underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </Text>
              <Button variant="secondary" onClick={onClose} className="self-end">
                {t("close")}
              </Button>
            </>
          ) : isDone ? (
            <>
              <Text variant="body" role="status">
                {t("report.thanks")}
              </Text>
              <Button onClick={onClose} className="self-end">
                {t("close")}
              </Button>
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
              className="flex flex-col gap-three"
            >
              <fieldset className="flex flex-col gap-two">
                <legend className="mb-two">
                  <Text variant="label" as="span">
                    {t("report.reasonLabel")}
                  </Text>
                </legend>
                {REPORT_REASONS.map((value) => (
                  <label key={value} className="flex items-center gap-two text-body">
                    <input
                      type="radio"
                      name="report-reason"
                      value={value}
                      checked={reason === value}
                      onChange={() => setReason(value)}
                    />
                    {t(`report.reasons.${value}`)}
                  </label>
                ))}
              </fieldset>

              <label className="flex flex-col gap-one">
                <Text variant="label" as="span">
                  {t("report.noteLabel")}
                </Text>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  maxLength={REPORT_NOTE_MAX_LENGTH + 50}
                  aria-describedby="report-note-counter"
                  className="rounded-small border border-border bg-surface px-three py-two text-body text-text"
                />
                <Text
                  variant="bodySmall"
                  muted={noteLength <= REPORT_NOTE_MAX_LENGTH}
                  className={
                    noteLength > REPORT_NOTE_MAX_LENGTH ? "self-end text-danger" : "self-end"
                  }
                  id="report-note-counter"
                >
                  {t("report.noteCounter", { count: noteLength, max: REPORT_NOTE_MAX_LENGTH })}
                </Text>
              </label>

              {error && (
                <Text variant="bodySmall" className="text-danger" role="alert">
                  {error}
                </Text>
              )}

              <div className="flex gap-two self-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onClose}
                  disabled={report.isPending}
                >
                  {tCommon("cancel")}
                </Button>
                <Button type="submit" disabled={!reason || report.isPending}>
                  {report.isPending ? t("report.sending") : t("report.submit")}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </dialog>
  );
}
