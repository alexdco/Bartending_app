"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAdminReviewCount } from "./use-admin-review";

/** The Needs review count beside Comments in the admin nav (spec 0062 AC-11). */
export function AdminReviewBadge() {
  const t = useTranslations("admin");
  const { data: count } = useAdminReviewCount();

  if (!count) return null;

  return (
    <Link
      href="/admin/comments?tab=review"
      aria-label={t("review.badgeLabel", { count })}
      className="rounded-full bg-danger px-two py-half text-label text-danger-text"
    >
      {count}
    </Link>
  );
}
