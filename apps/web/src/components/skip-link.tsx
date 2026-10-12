"use client";

import { useTranslations } from "next-intl";
import { MAIN_CONTENT_ID } from "./main-content";

// Spec 0038 AC-12: the first Tab stop on every page. Hidden until focused;
// activating it moves focus past the nav to the start of the page content.
export function SkipLink() {
  const t = useTranslations("common");

  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={(event) => {
        const target = document.getElementById(MAIN_CONTENT_ID);
        if (!target) {
          return;
        }
        event.preventDefault();
        target.focus();
        target.scrollIntoView();
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:left-four focus:top-four focus:z-50 focus:rounded-medium focus:bg-surface focus:px-four focus:py-two focus:text-label focus:text-text focus:shadow-lg"
    >
      {t("skipToContent")}
    </a>
  );
}
