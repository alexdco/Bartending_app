"use client";

import { useMemo, useState } from "react";
import { buildRecipeSlugPath, type AdminComment } from "@bartendingapp/shared";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { useAdminComments } from "./use-admin-comments";
import { useDeleteAdminComment } from "./use-admin-comment-mutations";

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function AdminCommentList() {
  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useAdminComments();

  const comments = useMemo(() => data?.pages.flatMap((page) => page.comments) ?? [], [data]);

  if (error) {
    return (
      <Text variant="bodySmall" muted>
        Couldn&apos;t load comments. Try again later.
      </Text>
    );
  }

  if (isPending) {
    return (
      <div className="flex justify-center py-four">
        <Spinner label="Loading comments" />
      </div>
    );
  }

  if (comments.length === 0) {
    return <EmptyState title="No comments yet" description="No comments have been posted." />;
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
          {isFetchingNextPage ? "Loading..." : "Load more"}
        </Button>
      )}
    </div>
  );
}

function AdminCommentRow({ comment }: { comment: AdminComment }) {
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
          {dateFormatter.format(new Date(comment.createdAt))}
          {comment.edited ? " (edited)" : ""}
        </Text>
      </div>
      <Text variant="bodySmall" muted>
        {comment.displayName ?? "Anonymous"}
      </Text>
      <Text variant="body">{comment.body}</Text>
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
          <Button variant="secondary" onClick={() => setIsConfirmingDelete(true)}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
