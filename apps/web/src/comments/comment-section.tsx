"use client";

import { useMemo, useState } from "react";
import {
  COMMENT_MAX_LENGTH,
  COMMENT_PHOTO_DAILY_LIMIT,
  COMMENT_PHOTO_MAX_COUNT,
  validateCommentBody,
  type Comment,
  type EditCommentError,
  type EditCommentPhotoInput,
  type PostCommentError,
} from "@bartendingapp/shared";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { useSession } from "@/auth/use-session";
import { useRecipeComments } from "./use-comments";
import { usePostComment, useEditComment, useDeleteComment } from "./use-comment-mutations";
import { CommentPhotoThumbnails } from "./comment-photo-thumbnails";
import { PhotoDraftField } from "./photo-draft-field";
import { usePhotoDrafts } from "./use-photo-drafts";

export interface CommentSectionProps {
  recipeId: string;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function CommentSection({ recipeId }: CommentSectionProps) {
  const { isLinked, isLoading: isSessionLoading } = useSession();
  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useRecipeComments(recipeId);

  const comments = useMemo(() => data?.pages.flatMap((page) => page.comments) ?? [], [data]);

  return (
    <section className="flex flex-col gap-three">
      <Text variant="subheading" as="h2">
        Comments
      </Text>

      <Composer recipeId={recipeId} isLinked={isLinked} isSessionLoading={isSessionLoading} />

      {error ? (
        <Text variant="bodySmall" muted>
          Couldn&apos;t load comments. Try again later.
        </Text>
      ) : isPending ? (
        <div className="flex justify-center py-four">
          <Spinner label="Loading comments" />
        </div>
      ) : comments.length === 0 ? (
        <EmptyState
          title="No comments yet"
          description="Be the first to share a tip or a variation."
        />
      ) : (
        <>
          <ul className="flex flex-col gap-three">
            {comments.map((comment) => (
              <li key={comment.id}>
                <CommentRow recipeId={recipeId} comment={comment} />
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
              {isFetchingNextPage ? "Loading..." : "Load more"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

type CommentWriteErrorReason = PostCommentError["reason"] | EditCommentError["reason"];

function commentErrorMessage(reason: CommentWriteErrorReason): string {
  switch (reason) {
    case "empty":
    case "comment_empty":
      return "Write something or add a photo before posting.";
    case "too_long":
    case "comment_too_long":
      return `Comments can be at most ${COMMENT_MAX_LENGTH} characters.`;
    case "no_session":
    case "anonymous_session":
    case "not_signed_in":
      return "Sign in to leave a comment.";
    case "too_many_photos":
      return `A comment can have at most ${COMMENT_PHOTO_MAX_COUNT} photos.`;
    case "invalid_photo":
      return "A photo couldn't be attached. Remove it and add it again.";
    case "recipe_unavailable":
      return "This recipe is no longer available.";
    case "not_found_or_not_owner":
      return "This comment no longer exists.";
    default:
      return "Couldn't save your comment. Try again.";
  }
}

/**
 * Validates the text against the photo count, then uploads any photos that
 * have no stored file yet. Returns the final photo list, or an error message
 * when the comment must not be written (spec 0032 AC-10).
 */
async function preparePhotos(
  body: string,
  photos: ReturnType<typeof usePhotoDrafts>,
  userId: string | undefined,
): Promise<{ photos: EditCommentPhotoInput[]; error: null } | { photos: null; error: string }> {
  const { error: bodyError } = validateCommentBody(body, { photoCount: photos.drafts.length });
  if (bodyError) return { photos: null, error: commentErrorMessage(bodyError) };

  if (!userId) return { photos: null, error: commentErrorMessage("no_session") };

  if (photos.isProcessing) {
    return { photos: null, error: "Wait for your photos to finish preparing." };
  }

  const upload = await photos.uploadPending(userId);

  if (!upload.ok) {
    return {
      photos: null,
      error: upload.dailyLimitReached
        ? `Daily photo limit reached (${COMMENT_PHOTO_DAILY_LIMIT} a day). Remove the photos that didn't upload, or try again tomorrow.`
        : "Some photos aren't ready. Retry or remove the ones marked below.",
    };
  }

  return { photos: upload.photos, error: null };
}

function Composer({
  recipeId,
  isLinked,
  isSessionLoading,
}: {
  recipeId: string;
  isLinked: boolean;
  isSessionLoading: boolean;
}) {
  const { session } = useSession();
  const [body, setBody] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const photos = usePhotoDrafts();
  const postComment = usePostComment(recipeId);

  if (!isSessionLoading && !isLinked) {
    return (
      <Text variant="bodySmall" muted>
        <Link href="/account" className="underline">
          Sign in
        </Link>{" "}
        to leave a comment.
      </Text>
    );
  }

  const isBusy = isUploading || postComment.isPending;

  const submit = async () => {
    setFormError(null);
    setIsUploading(true);
    const prepared = await preparePhotos(body, photos, session?.user.id);
    setIsUploading(false);

    if (prepared.error !== null) {
      setFormError(prepared.error);
      return;
    }

    const newPhotos = prepared.photos.flatMap((photo) =>
      photo.kind === "new"
        ? [{ path: photo.path, width: photo.width, height: photo.height, altText: photo.altText }]
        : [],
    );

    const result = await postComment.mutateAsync({ body, photos: newPhotos });

    if (result.data) {
      setBody("");
      photos.reset();
      return;
    }

    setFormError(commentErrorMessage(result.error.reason));
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-two"
    >
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={COMMENT_MAX_LENGTH + 200}
        placeholder="Share a tip, a variation, or your experience making it..."
        aria-label="Comment"
        rows={3}
        className="rounded-small border border-border bg-surface px-three py-two text-body text-text placeholder:text-text-muted"
      />
      <PhotoDraftField photos={photos} disabled={isBusy} onRetryUpload={() => void submit()} />
      {formError && (
        <Text variant="bodySmall" className="text-danger" role="alert">
          {formError}
        </Text>
      )}
      <Button type="submit" disabled={isBusy} className="self-end">
        {isUploading
          ? "Uploading photos..."
          : postComment.isPending
            ? "Posting..."
            : "Post comment"}
      </Button>
    </form>
  );
}

function CommentEditForm({
  recipeId,
  comment,
  onDone,
}: {
  recipeId: string;
  comment: Comment;
  onDone: () => void;
}) {
  const { session } = useSession();
  const [draft, setDraft] = useState(comment.body ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const photos = usePhotoDrafts(comment.photos);
  const editComment = useEditComment(recipeId);

  const isBusy = isUploading || editComment.isPending;

  const save = async () => {
    setFormError(null);
    setIsUploading(true);
    const prepared = await preparePhotos(draft, photos, session?.user.id);
    setIsUploading(false);

    if (prepared.error !== null) {
      setFormError(prepared.error);
      return;
    }

    const result = await editComment.mutateAsync({
      commentId: comment.id,
      body: draft,
      photos: prepared.photos,
    });

    if (result.data) {
      onDone();
      return;
    }

    setFormError(commentErrorMessage(result.error.reason));
  };

  return (
    <div className="flex flex-col gap-two rounded-medium border border-border p-three">
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={COMMENT_MAX_LENGTH + 200}
        aria-label="Edit comment"
        rows={3}
        className="rounded-small border border-border bg-surface px-three py-two text-body text-text"
      />
      <PhotoDraftField photos={photos} disabled={isBusy} onRetryUpload={() => void save()} />
      {formError && (
        <Text variant="bodySmall" className="text-danger" role="alert">
          {formError}
        </Text>
      )}
      <div className="flex gap-two self-end">
        <Button variant="secondary" disabled={isBusy} onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={isBusy} onClick={() => void save()}>
          {isUploading ? "Uploading photos..." : "Save"}
        </Button>
      </div>
    </div>
  );
}

function CommentRow({ recipeId, comment }: { recipeId: string; comment: Comment }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const deleteComment = useDeleteComment(recipeId);
  const { session } = useSession();

  const isOwn = session?.user.id === comment.userId;

  if (isEditing) {
    // Mounted fresh each time, so the draft starts from the saved comment.
    return (
      <CommentEditForm recipeId={recipeId} comment={comment} onDone={() => setIsEditing(false)} />
    );
  }

  return (
    <div className="flex flex-col gap-two rounded-medium border border-border p-three">
      <div className="flex items-center justify-between gap-two">
        <Text variant="label">{comment.displayName ?? "Anonymous"}</Text>
        <Text variant="bodySmall" muted>
          {dateFormatter.format(new Date(comment.createdAt))}
          {comment.edited ? " (edited)" : ""}
        </Text>
      </div>
      {comment.body && <Text variant="body">{comment.body}</Text>}
      <CommentPhotoThumbnails photos={comment.photos} displayName={comment.displayName} />
      {isOwn && (
        <div className="flex gap-two self-end">
          {isConfirmingDelete ? (
            <>
              <Text variant="bodySmall" muted>
                Delete this comment?
              </Text>
              <Button variant="secondary" onClick={() => setIsConfirmingDelete(false)}>
                Cancel
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
                Delete
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
              <Button variant="secondary" onClick={() => setIsConfirmingDelete(true)}>
                Delete
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
