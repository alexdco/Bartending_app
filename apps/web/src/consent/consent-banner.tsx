"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Text } from "@/components/text";
import { Button } from "@/components/button";
import { acceptCookieConsent, getCookieConsent } from "./consent-storage";

function subscribe() {
  return () => {};
}

export function ConsentBanner() {
  const t = useTranslations("consent");
  const [dismissed, setDismissed] = useState(false);
  const hasConsent = useSyncExternalStore(
    subscribe,
    () => getCookieConsent() !== null,
    () => true,
  );

  if (dismissed || hasConsent) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-four border-t border-border bg-surface px-six py-four">
      <Text variant="bodySmall">
        {t.rich("message", {
          link: (chunks) => (
            <Link href="/privacy" className="underline">
              {chunks}
            </Link>
          ),
        })}
      </Text>
      <Button
        onClick={() => {
          acceptCookieConsent();
          setDismissed(true);
        }}
      >
        {t("accept")}
      </Button>
    </div>
  );
}
