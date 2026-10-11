"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import { buildRecipeSlugPath, getCommentPhotoUrl, type AdminComment } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { useAdminComments } from "./use-admin-comments";
import { useDeleteAdminComment, useDeleteAdminCommentPhoto } from "./use-admin-comment-mutations";
import { useCommentPhotoLabel } from "@/comments/use-comment-photo-label";

export function AdminCommentList() {
  const t = useTranslations("admin");
  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useAdminComments();

  const comments = useMemo(() => data?.pages.flatMap((page) => page.comments) ?? [], [data]);

  if (error) {
    return (
      <Text variant="bodySmall" muted>
        {t("loadCommentsFailed")}
      </Text>
    );
  }

  if (isPending) {
    return (
      <div className="flex justify-center py-four">
        <Spinner label={t("loadingComments")} />
      </div>
    );
  }

  if (comments.length === 0) {
    return <EmptyState title={t("noComments")} description={t("noCommentsDescription")} />;
  }

  return (
    <div className="flex flex-col gap-three">
      <ul className="flex flex-col gap-three">
        {comments.map((comment) => (
          <li key={comment.id}>
            <AdminCommentRow comment={comment} />
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

function AdminCommentRow({ comment }: { comment: AdminComment }) {
  const t = useTranslations("admin");
  const tComments = useTranslations("comments");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const deleteComment = useDeleteAdminComment();

  return (
    <div className="flex flex-col gap-one rounded-medium border border-border p-three">
      <div className="flex items-center justify-between gap-two">
        <Link
          href={`/recipes/${buildRecipeSlugPath(comment.recipeId, comment.recipeName)}`}
          className="underline"
        >
          <Text variant="label">{comment.recipeName}</Text>
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
      {comment.photos.length > 0 && <AdminCommentPhotos comment={comment} />}
      <div className="flex gap-two self-end">
        {isConfirmingDelete ? (
          <>
            <Text variant="bodySmall" muted>
              {t("deleteCommentConfirm")}
            </Text>
            <Button variant="secondary" onClick={() => setIsConfirmingDelete(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              disabled={deleteComment.isPending}
              onClick={() =>
                deleteComment.mutate({
                  commentId: comment.id,
                  photoPaths: comment.photos.map((photo) => photo.storagePath),
                })
              }
            >
              {tCommon("delete")}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setIsConfirmingDelete(true)}>
            {tCommon("delete")}
          </Button>
        )}
      </div>
    </div>
  );
}

const ADMIN_THUMBNAIL_HEIGHT = 96;

/**
 * The comment's photos with a remove control on each (spec 0032 AC-11), so
 * one bad photo can go without deleting the useful text around it.
 */
function AdminCommentPhotos({ comment }: { comment: AdminComment }) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const commentPhotoLabel = useCommentPhotoLabel();
  const [confirmingPhotoId, setConfirmingPhotoId] = useState<string | null>(null);
  const deletePhoto = useDeleteAdminCommentPhoto();

  return (
    <ul className="flex flex-wrap gap-three">
      {comment.photos.map((photo) => {
        const label = commentPhotoLabel(photo, comment.photos.length, comment.displayName);
        const width = Math.round((photo.width / photo.height) * ADMIN_THUMBNAIL_HEIGHT);
        const isOnlyContent = comment.body === null && comment.photos.length === 1;

        return (
          <li key={photo.id} className="flex flex-col gap-one">
            <a
              href={getCommentPhotoUrl(supabase, photo.storagePath)}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-small border border-border"
              style={{ width, height: ADMIN_THUMBNAIL_HEIGHT }}
            >
              <Image
                src={getCommentPhotoUrl(supabase, photo.storagePath)}
                alt={label}
                width={width}
                height={ADMIN_THUMBNAIL_HEIGHT}
                sizes={`${width}px`}
                className="h-full w-full object-cover"
              />
            </a>
            {confirmingPhotoId === photo.id ? (
              <div className="flex flex-col gap-one">
                <Text variant="bodySmall" muted>
                  {isOnlyContent ? t("removePhotoAndCommentConfirm") : t("removePhotoConfirm")}
                </Text>
                <div className="flex gap-one">
                  <Button
                    variant="secondary"
                    className="px-two py-one"
                    onClick={() => setConfirmingPhotoId(null)}
                  >
                    {tCommon("cancel")}
                  </Button>
                  <Button
                    className="px-two py-one"
                    disabled={deletePhoto.isPending}
                    onClick={() => deletePhoto.mutate({ commentId: comment.id, photoId: photo.id })}
                  >
                    {tCommon("remove")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="secondary"
                className="px-two py-one"
                onClick={() => setConfirmingPhotoId(photo.id)}
                aria-label={t("removePhotoLabel", { label })}
              >
                {t("removePhoto")}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
