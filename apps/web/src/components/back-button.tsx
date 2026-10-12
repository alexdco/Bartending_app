"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { chooseBack, DEFAULT_BACK_FALLBACK } from "./navigation-history";
import { useNavigationDepth } from "./navigation-history-provider";

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

export interface BackButtonProps {
  /** The page's logical parent, used when no in app page is behind this one (spec 0038 AC-8). */
  fallbackHref?: string;
}

export function BackButton({ fallbackHref = DEFAULT_BACK_FALLBACK }: BackButtonProps) {
  const router = useRouter();
  const t = useTranslations("common");
  const getDepth = useNavigationDepth();

  const goBack = () => {
    const action = chooseBack(getDepth(), fallbackHref);
    if (action.kind === "back") {
      router.back();
    } else {
      // replace, not push, so a second Back does not bounce between the two.
      router.replace(action.href);
    }
  };

  return (
    <button
      type="button"
      aria-label={t("back")}
      onClick={goBack}
      className="flex w-fit items-center gap-one rounded-medium px-two py-one text-label text-text hover:bg-surface-selected"
    >
      <ArrowLeftIcon />
      {t("back")}
    </button>
  );
}
