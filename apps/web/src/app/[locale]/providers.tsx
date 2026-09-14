"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ensureAnonymousSession } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { ConsentBanner } from "@/consent/consent-banner";
import { getCookieConsent, subscribeToConsent } from "@/consent/consent-storage";
import { identify, initAnalyticsIfConsented } from "@/analytics/posthog-client";
import { useSession } from "@/auth/use-session";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const { session } = useSession();

  useEffect(() => {
    initAnalyticsIfConsented(getCookieConsent() !== null);
    return subscribeToConsent(() => {
      initAnalyticsIfConsented(getCookieConsent() !== null);
    });
  }, []);

  useEffect(() => {
    if (session?.user.id) {
      identify(session.user.id);
    }
  }, [session?.user.id]);

  useEffect(() => {
    let sawAnySession = false;
    let sawLinkedSession = false;
    let bootstrapping = false;

    const bootstrapGuestSession = () => {
      if (bootstrapping) {
        return;
      }
      bootstrapping = true;
      ensureAnonymousSession(supabase)
        .catch((error) => {
          console.error("Failed to establish a guest session", error);
        })
        .finally(() => {
          bootstrapping = false;
        });
    };

    bootstrapGuestSession();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        sawAnySession = true;
      }

      if (event === "TOKEN_REFRESHED" && session?.user && !session.user.is_anonymous) {
        sawLinkedSession = true;
      }

      if (event === "SIGNED_OUT") {
        // A lapsed anonymous session has no account to sign back into; silently
        // re-bootstrap rather than surface a sign in prompt. Skip the very first
        // SIGNED_OUT before any session has been observed - that's just the
        // client reporting "nothing yet" while sign-in is already in flight.
        if (sawAnySession && !sawLinkedSession) {
          bootstrapGuestSession();
        }
        sawLinkedSession = false;
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ConsentBanner />
    </QueryClientProvider>
  );
}
