"use client";

import { useMemo, useState } from "react";
import { COMMENT_MAX_LENGTH, validateCommentBody, type Comment } from "@bartendingapp/shared";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
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

function Composer({
  recipeId,
  isLinked,
  isSessionLoading,
}: {
  recipeId: string;
  isLinked: boolean;
  isSessionLoading: boolean;
}) {
  const [body, setBody] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const { trimmed, error: bodyError } = validateCommentBody(body);
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
      { body: trimmed },
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-two">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={COMMENT_MAX_LENGTH + 200}
        placeholder="Share a tip, a variation, or your experience making it..."
        rows={3}
        className="rounded-small border border-border bg-surface px-three py-two text-body text-text placeholder:text-text-muted"
      />
      {formError && (
        <Text variant="bodySmall" className="text-danger">
          {formError}
        </Text>
      )}
      <Button type="submit" disabled={postComment.isPending} className="self-end">
        {postComment.isPending ? "Posting..." : "Post comment"}
      </Button>
    </form>
  );
}

function CommentRow({ recipeId, comment }: { recipeId: string; comment: Comment }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const editComment = useEditComment(recipeId);
  const deleteComment = useDeleteComment(recipeId);
  const { session } = useSession();

  const isOwn = session?.user.id === comment.userId;

  if (isEditing) {
    return (
      <div className="flex flex-col gap-two rounded-medium border border-border p-three">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          className="rounded-small border border-border bg-surface px-three py-two text-body text-text"
        />
        <div className="flex gap-two self-end">
          <Button
            variant="secondary"
            onClick={() => {
              setIsEditing(false);
              setDraft(comment.body);
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={editComment.isPending}
            onClick={() => {
              editComment.mutate(
                { commentId: comment.id, body: draft },
                { onSuccess: (result) => result.data && setIsEditing(false) },
              );
            }}
          >
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-one rounded-medium border border-border p-three">
      <div className="flex items-center justify-between gap-two">
        <Text variant="label">{comment.displayName ?? "Anonymous"}</Text>
        <Text variant="bodySmall" muted>
          {dateFormatter.format(new Date(comment.createdAt))}
          {comment.edited ? " (edited)" : ""}
        </Text>
      </div>
      <Text variant="body">{comment.body}</Text>
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
                onClick={() => deleteComment.mutate({ commentId: comment.id })}
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
