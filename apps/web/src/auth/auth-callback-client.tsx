"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { supabase } from "@/lib/supabase";

export function AuthCallbackClient() {
  const t = useTranslations("account");
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const [linkExpired, setLinkExpired] = useState(!code);

  useEffect(() => {
    if (!code) {
      return;
    }

    let isRecovery = false;
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        isRecovery = true;
      }
    });

    supabase.auth
      .exchangeCodeForSession(code)
      .then(async ({ error: exchangeError }) => {
        if (exchangeError) {
          subscription.subscription.unsubscribe();
          setLinkExpired(true);
          return;
        }

        // Linking an anonymous account swaps auth.users.is_anonymous to
        // false, but the JWT just issued by exchangeCodeForSession can still
        // carry the pre-link claim; force a refresh so RLS checks reading
        // auth.jwt() ->> 'is_anonymous' (e.g. bars_insert) see the update
        // immediately instead of only after the token's next natural
        // rotation.
        await supabase.auth.refreshSession();
        subscription.subscription.unsubscribe();

        router.replace(isRecovery ? "/account/reset-password" : "/account");
      })
      .catch(() => {
        subscription.subscription.unsubscribe();
        setLinkExpired(true);
      });

    return () => subscription.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (linkExpired) {
    return (
      <div className="flex flex-1 items-center justify-center p-six">
        <EmptyState title={t("linkExpiredTitle")} description={t("linkExpiredDescription")} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-six">
      <Spinner label={t("signingYouIn")} />
    </div>
  );
}
