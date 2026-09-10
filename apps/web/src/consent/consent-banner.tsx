"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Text } from "@/components/text";
import { Button } from "@/components/button";
import { acceptCookieConsent, getCookieConsent } from "./consent-storage";

function subscribe() {
  return () => {};
}

export function ConsentBanner() {
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
        We use local storage to remember your pantry and preferences, and, once you accept, product
        analytics to see how the app is used. See our{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </Text>
      <Button
        onClick={() => {
          acceptCookieConsent();
          setDismissed(true);
        }}
      >
        Accept
      </Button>
    </div>
  );
}
