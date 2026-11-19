"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import {
  buildRecipeSlugPath,
  getCommentPhotoUrl,
  REPORT_REASONS,
  type AdminReviewRow,
  type AdminReviewTarget,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { useCommentPhotoLabel } from "@/comments/use-comment-photo-label";
import { useAdminReviewAction, useAdminReviewQueue } from "./use-admin-review";

const THUMBNAIL_HEIGHT = 96;

/** The Needs review tab on /admin/comments (spec 0062 AC-11, AC-12). */
export function AdminReviewList() {
  const t = useTranslations("admin");
  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useAdminReviewQueue();

  const rows = useMemo(() => data?.pages.flatMap((page) => page.rows) ?? [], [data]);

  if (error) {
    return (
      <Text variant="bodySmall" muted>
        {t("review.loadFailed")}
      </Text>
    );
  }

  if (isPending) {
    return (
      <div className="flex justify-center py-four">
        <Spinner label={t("review.loading")} />
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={t("review.emptyTitle")} description={t("review.emptyDescription")} />;
  }

  return (
    <div className="flex flex-col gap-three">
      <ul className="flex flex-col gap-three">
        {rows.map((row) => (
          <li key={row.comment.id}>
            <ReviewRow row={row} />
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <Button
          variant="secondary"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="self-center"
        >
          {isFetchingNextPage ? t("loadingMore") : t("loadMore")}
        </Button>
      )}
    </div>
  );
}

function ReviewRow({ row }: { row: AdminReviewRow }) {
  const tComments = useTranslations("comments");
  const format = useFormatter();
  const commentPhotoLabel = useCommentPhotoLabel();
  const { comment } = row;

  return (
    <div className="flex flex-col gap-two rounded-medium border border-border p-three">
      <div className="flex items-center justify-between gap-two">
        <Link
          href={`/recipes/${buildRecipeSlugPath(comment.recipeId, row.recipeName, row.recipeName)}`}
          className="underline"
        >
          <Text variant="label">{row.recipeName}</Text>
        </Link>
        <Text variant="bodySmall" muted>
          {format.dateTime(new Date(comment.createdAt), { dateStyle: "medium" })}
          {comment.edited ? ` ${tComments("edited")}` : ""}
        </Text>
      </div>
      <Text variant="bodySmall" muted>
        {comment.displayName ?? tComments("anonymous")}
      </Text>
      {comment.body && <Text variant="body">{comment.body}</Text>}
      {comment.photos.length > 0 && (
        <ul className="flex flex-wrap gap-two">
          {comment.photos.map((photo) => {
            const width = Math.round((photo.width / photo.height) * THUMBNAIL_HEIGHT);
            const label = commentPhotoLabel(photo, comment.photos.length, comment.displayName);
            return (
              <li key={photo.id}>
                <a
                  href={getCommentPhotoUrl(supabase, photo.storagePath)}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-small border border-border"
                  style={{ width, height: THUMBNAIL_HEIGHT }}
                >
                  <Image
                    src={getCommentPhotoUrl(supabase, photo.storagePath)}
                    alt={label}
                    width={width}
                    height={THUMBNAIL_HEIGHT}
                    sizes={`${width}px`}
                    className="h-full w-full object-cover"
                  />
                </a>
              </li>
            );
          })}
        </ul>
      )}
      <ul className="flex flex-col gap-two border-t border-border pt-two">
        {row.targets.map((target) => (
          <li key={target.target.kind === "photo" ? target.target.photoId : "comment"}>
            <ReviewTarget row={row} target={target} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewTarget({ row, target }: { row: AdminReviewRow; target: AdminReviewTarget }) {
  const t = useTranslations("admin");
  const tComments = useTranslations("comments");
  const tCommon = useTranslations("common");
  const action = useAdminReviewAction();
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);
  const [failed, setFailed] = useState(false);

  const photoId = target.target.kind === "photo" ? target.target.photoId : null;
  const name =
    photoId === null
      ? t("review.targetComment")
      : t("review.targetPhoto", {
          number: row.comment.photos.findIndex((photo) => photo.id === photoId) + 1,
        });
  const photoPaths = row.comment.photos
    .filter((photo) => photoId === null || photo.id === photoId)
    .map((photo) => photo.storagePath);
  const reasons = REPORT_REASONS.flatMap((reason) => {
    const count = target.openReportCounts[reason];
    return count ? [`${tComments(`report.reasons.${reason}`)} × ${count}`] : [];
  });

  const run = async (kind: "clear" | "remove") => {
    setFailed(false);
    const ok = await action.mutateAsync(
      kind === "clear"
        ? { kind, target: target.target }
        : { kind, target: target.target, photoPaths },
    );
    if (!ok) setFailed(true);
  };

  return (
    <div className="flex flex-col gap-one">
      <div className="flex flex-wrap items-center gap-two">
        <Text variant="label" as="span">
          {name}
        </Text>
        <Text variant="bodySmall" muted as="span">
          {t(`review.status.${target.moderationStatus}`)}
          {target.flagReason ? ` · ${t(`review.flagReasons.${target.flagReason}`)}` : ""}
        </Text>
      </div>
      {target.flagCategories.length > 0 && (
        <Text variant="bodySmall">
          {target.flagCategories.map((category) => t(`review.categories.${category}`)).join(", ")}
        </Text>
      )}
      {reasons.length > 0 && (
        <Text variant="bodySmall">
          {t("review.openReports")}: {reasons.join(", ")}
        </Text>
      )}
      {target.notes.length > 0 && (
        <div className="flex flex-col gap-half">
          <Text variant="bodySmall" muted>
            {t("review.notes")}
          </Text>
          <ul className="flex list-disc flex-col gap-half pl-four">
            {target.notes.map((note, index) => (
              <li key={index}>
                <Text variant="bodySmall" as="span">
                  {note}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      )}
      {failed && (
        <Text variant="bodySmall" className="text-danger" role="alert">
          {t("review.actionFailed")}
        </Text>
      )}
      <div className="flex flex-wrap gap-two self-end">
        {isConfirmingRemove ? (
          <>
            <Text variant="bodySmall" muted>
              {target.target.kind === "comment"
                ? t("review.removeCommentConfirm")
                : row.comment.body === null && row.comment.photos.length === 1
                  ? t("removePhotoAndCommentConfirm")
                  : t("removePhotoConfirm")}
            </Text>
            <Button variant="secondary" onClick={() => setIsConfirmingRemove(false)}>
              {tCommon("cancel")}
            </Button>
            <Button disabled={action.isPending} onClick={() => void run("remove")}>
              {t("review.remove")}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              disabled={action.isPending}
              onClick={() => void run("clear")}
              aria-label={t("review.clearLabel", { target: name })}
            >
              {t("review.clear")}
            </Button>
            <Button
              variant="secondary"
              disabled={action.isPending}
              onClick={() => setIsConfirmingRemove(true)}
              aria-label={t("review.removeLabel", { target: name })}
            >
              {t("review.remove")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
