import { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";

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
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Radii, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
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
    <View style={styles.container}>
      <Text variant="subheading">Comments</Text>

      <Composer recipeId={recipeId} isLinked={isLinked} isSessionLoading={isSessionLoading} />

      {error ? (
        <Text variant="bodySmall" muted>
          Couldn&apos;t load comments. Try again later.
        </Text>
      ) : isPending ? (
        <View style={styles.centered}>
          <Spinner label="Loading comments" />
        </View>
      ) : comments.length === 0 ? (
        <EmptyState
          title="No comments yet"
          description="Be the first to share a tip or a variation."
        />
      ) : (
        <View style={styles.list}>
          {comments.map((comment) => (
            <CommentRow key={comment.id} recipeId={recipeId} comment={comment} />
          ))}

          {hasNextPage && (
            <View style={styles.centered}>
              {isFetchingNextPage ? (
                <Spinner label="Loading more comments" />
              ) : (
                <Button variant="secondary" onPress={() => fetchNextPage()}>
                  Load more
                </Button>
              )}
            </View>
          )}
        </View>
      )}
    </View>
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
        : "Some photos aren't ready. Retry or remove the ones marked above.",
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
  const theme = useTheme();
  const { session } = useSession();
  const [body, setBody] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const photos = usePhotoDrafts();
  const postComment = usePostComment(recipeId);

  if (!isSessionLoading && !isLinked) {
    return (
      <Pressable onPress={() => router.push("/account")}>
        <Text variant="bodySmall" muted>
          Sign in to leave a comment.
        </Text>
      </Pressable>
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
    <View style={styles.composer}>
      <TextInput
        value={body}
        onChangeText={setBody}
        maxLength={COMMENT_MAX_LENGTH + 200}
        placeholder="Share a tip, a variation, or your experience making it..."
        placeholderTextColor={theme.textMuted}
        accessibilityLabel="Comment"
        multiline
        numberOfLines={3}
        style={[
          styles.input,
          { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text },
        ]}
      />
      <PhotoDraftField photos={photos} disabled={isBusy} onRetryUpload={() => void submit()} />
      {formError && (
        <Text variant="bodySmall" style={{ color: theme.danger }} accessibilityLiveRegion="polite">
          {formError}
        </Text>
      )}
      <Button disabled={isBusy} onPress={() => void submit()} style={styles.selfEnd}>
        {isUploading
          ? "Uploading photos..."
          : postComment.isPending
            ? "Posting..."
            : "Post comment"}
      </Button>
    </View>
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
  const theme = useTheme();
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
    <View style={[styles.card, { borderColor: theme.border }]}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        maxLength={COMMENT_MAX_LENGTH + 200}
        accessibilityLabel="Edit comment"
        multiline
        numberOfLines={3}
        style={[
          styles.input,
          { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text },
        ]}
      />
      <PhotoDraftField photos={photos} disabled={isBusy} onRetryUpload={() => void save()} />
      {formError && (
        <Text variant="bodySmall" style={{ color: theme.danger }} accessibilityLiveRegion="polite">
          {formError}
        </Text>
      )}
      <View style={styles.rowActions}>
        <Button variant="secondary" disabled={isBusy} onPress={onDone}>
          Cancel
        </Button>
        <Button disabled={isBusy} onPress={() => void save()}>
          {isUploading ? "Uploading photos..." : "Save"}
        </Button>
      </View>
    </View>
  );
}

function CommentRow({ recipeId, comment }: { recipeId: string; comment: Comment }) {
  const theme = useTheme();
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
    <View style={[styles.card, { borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <Text variant="label">{comment.displayName ?? "Anonymous"}</Text>
        <Text variant="bodySmall" muted>
          {dateFormatter.format(new Date(comment.createdAt))}
          {comment.edited ? " (edited)" : ""}
        </Text>
      </View>
      {comment.body && <Text variant="body">{comment.body}</Text>}
      <CommentPhotoThumbnails photos={comment.photos} displayName={comment.displayName} />
      {isOwn && (
        <View style={styles.rowActions}>
          {isConfirmingDelete ? (
            <>
              <Text variant="bodySmall" muted>
                Delete this comment?
              </Text>
              <Button variant="secondary" onPress={() => setIsConfirmingDelete(false)}>
                Cancel
              </Button>
              <Button
                disabled={deleteComment.isPending}
                onPress={() =>
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
              <Button variant="secondary" onPress={() => setIsEditing(true)}>
                Edit
              </Button>
              <Button variant="secondary" onPress={() => setIsConfirmingDelete(true)}>
                Delete
              </Button>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  composer: {
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radii.small,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    textAlignVertical: "top",
  },
  selfEnd: {
    alignSelf: "flex-end",
  },
  list: {
    gap: Spacing.three,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radii.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.two,
  },
  rowActions: {
    flexDirection: "row",
    gap: Spacing.two,
    alignSelf: "flex-end",
    alignItems: "center",
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.four,
  },
});
