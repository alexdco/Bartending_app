"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  buildRecipeSlugPath,
  type MyRecipeSubmissionSummary,
  type SubmissionStatus,
} from "@bartendingapp/shared";
import { useSession } from "@/auth/use-session";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { SubmissionSignInPrompt } from "./submission-sign-in-prompt";
import { useMyRecipeSubmissions, useWithdrawRecipeSubmission } from "./use-submissions";

/** /my-recipes: the author's submissions and where each stands (spec 0064 AC-1, AC-6, AC-13). */
export function MyRecipesPageClient() {
  const t = useTranslations("submissions");
  const { isLinked, isLoading } = useSession();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-four px-four py-six">
      <div className="flex flex-wrap items-center justify-between gap-three">
        <Text variant="display" as="h1">
          {t("myRecipesTitle")}
        </Text>
        {isLinked && <LinkButton href="/my-recipes/new">{t("submitCta")}</LinkButton>}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-six">
          <Spinner label={t("loading")} />
        </div>
      ) : isLinked ? (
        <MySubmissionList />
      ) : (
        <SubmissionSignInPrompt />
      )}
    </div>
  );
}

function MySubmissionList() {
  const t = useTranslations("submissions");
  const tCommon = useTranslations("common");
  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useMyRecipeSubmissions();
  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

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
      <div className="flex justify-center py-six">
        <Spinner label={t("loading")} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title={t("emptyTitle")}
        description={t("emptyDescription")}
        action={<LinkButton href="/my-recipes/new">{t("submitCta")}</LinkButton>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-three">
      <ul className="flex flex-col gap-three">
        {items.map((item) => (
          <li key={item.id}>
            <MySubmissionRow item={item} />
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

const STATUS_KEY: Record<SubmissionStatus, "statusPending" | "statusApproved" | "statusRejected"> =
  {
    pending: "statusPending",
    approved: "statusApproved",
    rejected: "statusRejected",
  };

const STATUS_CLASS: Record<SubmissionStatus, string> = {
  pending: "bg-surface-selected text-text",
  approved: "bg-accent text-accent-text",
  rejected: "border border-danger text-danger",
};

function MySubmissionRow({ item }: { item: MyRecipeSubmissionSummary }) {
  const t = useTranslations("submissions");
  const liveRecipe =
    item.status === "approved" && item.approvedRecipeId !== null && !item.recipeRemoved
      ? {
          id: item.approvedRecipeId,
          name: item.recipeName ?? item.name,
          baseName: item.recipeBaseName ?? item.name,
        }
      : null;

  return (
    <div className="flex flex-col gap-two rounded-medium border border-border p-three">
      <div className="flex items-start justify-between gap-three">
        {/* Author text renders as plain text only (invariant 8). */}
        <Text variant="subheading" as="h2" className="break-words">
          {liveRecipe?.name ?? item.name}
        </Text>
        <span
          className={`shrink-0 rounded-full px-two py-half text-label font-medium ${STATUS_CLASS[item.status]}`}
        >
          {t(STATUS_KEY[item.status])}
        </span>
      </div>

      {item.status === "rejected" && item.rejectionReason && (
        <div className="flex flex-col gap-half">
          <Text variant="label">{t("rejectionReasonLabel")}</Text>
          <Text variant="bodySmall" className="whitespace-pre-line break-words">
            {item.rejectionReason}
          </Text>
        </div>
      )}

      {item.status !== "approved" && <AuthorActions item={item} />}

      {liveRecipe ? (
        <Link
          href={`/recipes/${buildRecipeSlugPath(liveRecipe.id, liveRecipe.name, liveRecipe.baseName)}`}
          className="self-start text-label font-medium underline underline-offset-4"
        >
          {t("viewRecipe")}
        </Link>
      ) : item.status === "approved" ? (
        <Text variant="bodySmall" muted>
          {t("removedFromCatalog")}
        </Text>
      ) : null}
    </div>
  );
}

/** AC-6: edit and withdraw, for pending and rejected rows only. */
function AuthorActions({ item }: { item: MyRecipeSubmissionSummary }) {
  const t = useTranslations("submissions");
  const tCommon = useTranslations("common");
  const withdraw = useWithdrawRecipeSubmission();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleWithdraw() {
    setError(null);
    const result = await withdraw.mutateAsync(item.id);
    if (result.error) {
      setError(
        result.error.reason === "not_editable" ? t("errorNotEditable") : t("withdrawFailed"),
      );
      setIsConfirming(false);
    }
  }

  return (
    <div className="flex flex-col gap-one">
      <div className="flex flex-wrap items-center gap-two">
        {isConfirming ? (
          <>
            <Text variant="bodySmall" muted>
              {t("withdrawConfirm")}
            </Text>
            <Button variant="secondary" onClick={() => setIsConfirming(false)}>
              {tCommon("cancel")}
            </Button>
            <Button disabled={withdraw.isPending} onClick={handleWithdraw}>
              {withdraw.isPending ? t("withdrawing") : t("withdraw")}
            </Button>
          </>
        ) : (
          <>
            <LinkButton href={`/my-recipes/${item.id}/edit`}>
              {item.status === "rejected" ? t("editAndResubmit") : t("edit")}
            </LinkButton>
            <Button variant="secondary" onClick={() => setIsConfirming(true)}>
              {t("withdraw")}
            </Button>
          </>
        )}
      </div>
      {error && (
        <Text variant="bodySmall" role="alert" className="text-danger">
          {error}
        </Text>
      )}
    </div>
  );
}
