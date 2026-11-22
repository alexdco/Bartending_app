"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  AdminSubmissionSummary,
  ScreeningResult,
  SubmissionStatus,
} from "@bartendingapp/shared";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { SegmentedControl } from "@/components/segmented-control";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { useAdminRecipeSubmissions } from "@/submissions/use-submissions";

/**
 * /admin/submissions: Pending (oldest first), Rejected, and Approved (newest
 * review first), keyset paginated (spec 0064 AC-10).
 */
export function AdminSubmissions() {
  const t = useTranslations("admin.recipeSubmissions");
  const [status, setStatus] = useState<SubmissionStatus>("pending");

  return (
    <div className="flex flex-col gap-four">
      <SegmentedControl
        label={t("tabsLabel")}
        options={[
          { value: "pending", label: t("pendingTab") },
          { value: "rejected", label: t("rejectedTab") },
          { value: "approved", label: t("approvedTab") },
        ]}
        value={status}
        onValueChange={setStatus}
      />
      <AdminSubmissionList key={status} status={status} />
    </div>
  );
}

function AdminSubmissionList({ status }: { status: SubmissionStatus }) {
  const t = useTranslations("admin.recipeSubmissions");
  const tCommon = useTranslations("common");
  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useAdminRecipeSubmissions(status);
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
      <div className="flex justify-center py-four">
        <Spinner label={t("loading")} />
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />;
  }

  return (
    <div className="flex flex-col gap-three">
      <ul className="flex flex-col gap-three">
        {items.map((item) => (
          <li key={item.id}>
            <AdminSubmissionRow item={item} />
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

function AdminSubmissionRow({ item }: { item: AdminSubmissionSummary }) {
  const t = useTranslations("admin.recipeSubmissions");
  return (
    <Link
      href={`/admin/submissions/${item.id}`}
      className="flex flex-col gap-one rounded-medium border border-border p-three hover:bg-surface-selected"
    >
      {/* Author text renders as plain text only (invariant 8). */}
      <Text variant="label" className="break-words">
        {item.name}
      </Text>
      <Text variant="bodySmall" muted>
        {item.authorDisplayName ?? t("noDisplayName")} · {item.locale.toUpperCase()}
      </Text>
      <ScreeningBadges text={item.textScreening} photo={item.photoScreening} />
    </Link>
  );
}

const SCREENING_KEY: Record<
  ScreeningResult,
  "screeningPending" | "screeningClear" | "screeningFlagged" | "screeningError" | "screeningSkipped"
> = {
  pending: "screeningPending",
  clear: "screeningClear",
  flagged: "screeningFlagged",
  error: "screeningError",
  skipped: "screeningSkipped",
};

export function ScreeningBadges({
  text,
  photo,
}: {
  text: ScreeningResult | null;
  photo: ScreeningResult | null;
}) {
  const t = useTranslations("admin.recipeSubmissions");
  const badge = (label: string, result: ScreeningResult) => (
    <span
      className={`rounded-full px-two py-half text-label font-medium ${
        result === "flagged"
          ? "border border-danger text-danger"
          : result === "clear"
            ? "bg-surface-selected text-text"
            : "border border-border text-text-muted"
      }`}
    >
      {label}: {t(SCREENING_KEY[result])}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-two">
      {text && badge(t("textScreening"), text)}
      {photo && badge(t("photoScreening"), photo)}
    </div>
  );
}
