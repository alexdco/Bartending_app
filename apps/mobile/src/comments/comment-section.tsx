import { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";

import { COMMENT_MAX_LENGTH, validateCommentBody, type Comment } from "@bartendingapp/shared";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Radii, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useSession } from "@/auth/use-session";
import { useRecipeComments } from "./use-comments";
import { usePostComment, useEditComment, useDeleteComment } from "./use-comment-mutations";

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
  const [body, setBody] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
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

  const handleSubmit = () => {
    const { error: bodyError } = validateCommentBody(body);
    if (bodyError) {
      setFormError(
        bodyError === "empty"
          ? "Write something before posting."
          : "Comments can be at most 1000 characters.",
      );
      return;
    }

    setFormError(null);

    postComment.mutate(
      { body },
      {
        onSuccess: (result) => {
          if (result.data) {
            setBody("");
            return;
          }

          setFormError(
            result.error.reason === "empty"
              ? "Write something before posting."
              : result.error.reason === "too_long"
                ? "Comments can be at most 1000 characters."
                : result.error.reason === "anonymous_session"
                  ? "Sign in to leave a comment."
                  : "Couldn't post your comment. Try again.",
          );
        },
      },
    );
  };

  return (
    <View style={styles.composer}>
      <TextInput
        value={body}
        onChangeText={setBody}
        maxLength={COMMENT_MAX_LENGTH + 200}
        placeholder="Share a tip, a variation, or your experience making it..."
        placeholderTextColor={theme.textMuted}
        multiline
        numberOfLines={3}
        style={[
          styles.input,
          { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text },
        ]}
      />
      {formError && (
        <Text variant="bodySmall" style={{ color: theme.danger }}>
          {formError}
        </Text>
      )}
      <Button disabled={postComment.isPending} onPress={handleSubmit} style={styles.selfEnd}>
        {postComment.isPending ? "Posting..." : "Post comment"}
      </Button>
    </View>
  );
}

function CommentRow({ recipeId, comment }: { recipeId: string; comment: Comment }) {
  const theme = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [draft, setDraft] = useState(comment.body ?? "");
  const editComment = useEditComment(recipeId);
  const deleteComment = useDeleteComment(recipeId);
  const { session } = useSession();

  const isOwn = session?.user.id === comment.userId;

  if (isEditing) {
    return (
      <View style={[styles.card, { borderColor: theme.border }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          numberOfLines={3}
          style={[
            styles.input,
            { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text },
          ]}
        />
        <View style={styles.rowActions}>
          <Button
            variant="secondary"
            onPress={() => {
              setIsEditing(false);
              setDraft(comment.body ?? "");
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={editComment.isPending}
            onPress={() => {
              editComment.mutate(
                {
                  commentId: comment.id,
                  body: draft,
                  photos: comment.photos.map((photo) => ({
                    kind: "existing" as const,
                    id: photo.id,
                    altText: photo.altText,
                  })),
                },
                { onSuccess: (result) => result.data && setIsEditing(false) },
              );
            }}
          >
            Save
          </Button>
        </View>
      </View>
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
    gap: Spacing.one,
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
