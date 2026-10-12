"use client";

import { useEffect, type KeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import {
  confirmAge,
  denyAge,
  useAgeGateDomSync,
  useAgeGateState,
  type WebAgeGateState,
} from "./age-gate-store";

// Age confirmation overlay (spec 0037, AC-9 to AC-17). Both panels are server
// rendered and globals.css shows the gate, and picks the panel, from
// html[data-age], which the inline head script sets before paint. So nothing
// here decides visibility on first paint, and there is no flash either way.

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapTab(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab") return;

  const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.offsetParent !== null,
  );
  const first = focusable.at(0);
  const last = focusable.at(-1);
  if (!first || !last) return;

  const active = document.activeElement;
  const leavingEnd =
    !event.shiftKey && (active === last || !focusable.includes(active as HTMLElement));
  const leavingStart =
    event.shiftKey && (active === first || !focusable.includes(active as HTMLElement));

  if (leavingEnd) {
    event.preventDefault();
    first.focus();
  } else if (leavingStart) {
    event.preventDefault();
    last.focus();
  }
}

const YES_ID = "age-gate-yes";
const BLOCKED_TITLE_ID = "age-gate-blocked-title";

function useFocusOnShow(state: WebAgeGateState) {
  useEffect(() => {
    if (state === "ask") document.getElementById(YES_ID)?.focus();
    if (state === "denied") document.getElementById(BLOCKED_TITLE_ID)?.focus();
  }, [state]);
}

function Panel({
  className,
  labelledBy,
  children,
}: {
  className: string;
  labelledBy: string;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className={`${className} flex w-full max-w-md flex-col gap-four rounded-large border border-border bg-surface p-six`}
    >
      {children}
    </div>
  );
}

export function AgeGate() {
  const t = useTranslations("ageGate");
  const state = useAgeGateState();
  useAgeGateDomSync(state);
  useFocusOnShow(state);

  const notice = (
    <Text variant="bodySmall" muted>
      {t("responsibleDrinking")}
    </Text>
  );

  return (
    <div
      // The backdrop only hosts the Tab focus trap; the dialog semantics live on the Panel.
      role="presentation"
      className="age-gate fixed inset-0 z-[60] items-center justify-center bg-black/60 px-four"
      onKeyDown={trapTab}
    >
      <Panel className="age-gate-ask" labelledBy="age-gate-title">
        <Text variant="heading" as="h2" id="age-gate-title">
          {t("title")}
        </Text>
        <Text variant="body">{t("question")}</Text>
        <div className="flex flex-wrap gap-two">
          <Button id={YES_ID} onClick={confirmAge}>
            {t("yes")}
          </Button>
          <Button variant="secondary" onClick={denyAge}>
            {t("no")}
          </Button>
        </div>
        {notice}
      </Panel>

      <Panel className="age-gate-blocked" labelledBy={BLOCKED_TITLE_ID}>
        <Text
          variant="heading"
          as="h2"
          id={BLOCKED_TITLE_ID}
          tabIndex={-1}
          className="outline-none"
        >
          {t("blockedTitle")}
        </Text>
        <Text variant="body">{t("blockedBody")}</Text>
        <Link href="/privacy" className="underline">
          <Text variant="label" as="span">
            {t("privacyLink")}
          </Text>
        </Link>
        {notice}
      </Panel>
    </div>
  );
}
