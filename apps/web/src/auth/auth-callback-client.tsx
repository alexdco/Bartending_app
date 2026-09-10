"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { supabase } from "@/lib/supabase";

const LINK_EXPIRED_MESSAGE = "This link is invalid or has expired.";

export function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const [error, setError] = useState<string | null>(code ? null : LINK_EXPIRED_MESSAGE);

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
      .then(({ error: exchangeError }) => {
        subscription.subscription.unsubscribe();

        if (exchangeError) {
          setError("This link is invalid or has expired.");
          return;
        }

        router.replace(isRecovery ? "/account/reset-password" : "/account");
      })
      .catch(() => {
        subscription.subscription.unsubscribe();
        setError("This link is invalid or has expired.");
      });

    return () => subscription.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-six">
        <EmptyState title="Link expired" description={error} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-six">
      <Spinner label="Signing you in" />
    </div>
  );
}
