"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

function ArrowLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M19 12H5M5 12l6-6M5 12l6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BackButton() {
  const router = useRouter();
  const t = useTranslations("common");

  return (
    <button
      type="button"
      aria-label={t("back")}
      onClick={() => router.back()}
      className="flex w-fit items-center gap-one rounded-medium px-two py-one text-label text-text hover:bg-surface-selected"
    >
      <ArrowLeftIcon />
      {t("back")}
    </button>
  );
}
