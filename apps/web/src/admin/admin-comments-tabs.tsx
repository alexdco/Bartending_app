"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SegmentedControl } from "@/components/segmented-control";
import { AdminCommentList } from "./admin-comment-list";
import { AdminReviewList } from "./admin-review-list";

type CommentsTab = "all" | "review";

/**
 * All comments or the Needs review queue on /admin/comments (spec 0062
 * AC-11). The nav badge links here with `?tab=review`.
 */
export function AdminCommentsTabs() {
  const t = useTranslations("admin");
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<CommentsTab>(
    searchParams.get("tab") === "review" ? "review" : "all",
  );

  return (
    <div className="flex flex-col gap-four">
      <SegmentedControl
        label={t("review.tabsLabel")}
        options={[
          { value: "all", label: t("review.allTab") },
          { value: "review", label: t("review.needsReviewTab") },
        ]}
        value={tab}
        onValueChange={setTab}
      />
      {tab === "review" ? <AdminReviewList /> : <AdminCommentList />}
    </div>
  );
}
