"use client";

import { useEffect, useId } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Text } from "@/components/text";
import { useMocktailsOnly } from "@/age-gate/age-gate-store";

// The notice shown in mocktails only mode in place of content that is not
// mocktail safe (spec 0063, AC-6, AC-9 to AC-12, AC-18). It is server
// rendered next to the hidden content and marked data-mocktails="notice", so
// globals.css shows it only under html[data-age="mocktails"], before
// hydration too. Adults get the same cached HTML with the notice hidden, so
// the focus move and the tab title change run only once the mode is known on.
export function MocktailsUnavailable() {
  const t = useTranslations("mocktails");
  const mocktailsOnly = useMocktailsOnly();
  const headingId = useId();

  useEffect(() => {
    if (!mocktailsOnly) return;
    document.title = t("unavailableTitle");
    document.getElementById(headingId)?.focus();
  }, [mocktailsOnly, t, headingId]);

  return (
    <section data-mocktails="notice" className="flex flex-col gap-three">
      <Text variant="display" as="h1" id={headingId} tabIndex={-1} className="outline-none">
        {t("unavailableTitle")}
      </Text>
      <Text variant="body">{t("unavailableBody")}</Text>
      <Link href="/search" className="underline">
        <Text variant="label" as="span">
          {t("browseLink")}
        </Text>
      </Link>
    </section>
  );
}
