"use client";

import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ensureAnonymousSession } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { ConsentBanner } from "@/consent/consent-banner";
import { getCookieConsent, subscribeToConsent } from "@/consent/consent-storage";
import { identify, initAnalyticsIfConsented } from "@/analytics/posthog-client";
import { useSession } from "@/auth/use-session";
import { webLocalStoragePersisterAdapter } from "@/service/local-storage-persister";
import { useBarRemovalEviction } from "@/service/use-bar-removal-eviction";
import { AgeGate } from "@/age-gate/age-gate";
import { NavigationHistoryProvider } from "@/components/navigation-history-provider";
import { APP_CONTENT_ID, useAgeGateState } from "@/age-gate/age-gate-store";

// Bartender Mode's offline requirement (spec 0023-quick-build-mode.md,
// AC-6): a bartender's already opened recipes must render with no network
// connection even after the browser tab is fully closed and reopened, which
// an in memory QueryClient alone can't do. Only the query keys Quick Build
// Mode and the Service screen actually need offline are persisted (see
// shouldDehydrateQuery below); everything else in the app keeps the plain
// in memory cache behavior it already has. Mirrors apps/mobile/src/app/
// _layout.tsx's AsyncStorage-backed persister, swapped for a localStorage
// backed adapter (see local-storage-persister.ts for why raw
// window.localStorage can't be passed in directly).
const webQueryPersister = createAsyncStoragePersister({
  storage: webLocalStoragePersisterAdapter,
  key: "bartenderModeQueryCache",
});

const PERSISTED_QUERY_KEY_PREFIXES = ["bar-service-data", "quick-build-recipe"];

const PERSIST_OPTIONS = {
  persister: webQueryPersister,
  // Bump this when a persisted query's shape changes incompatibly, so a
  // stale shape from a previous build is never deserialized. Kept in sync
  // with mobile's buster string per the umbrella spec's cross child contract.
  buster: "bartender-mode-v1",
  maxAge: 24 * 60 * 60 * 1000,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { queryKey: readonly unknown[] }) =>
      typeof query.queryKey[0] === "string" &&
      PERSISTED_QUERY_KEY_PREFIXES.includes(query.queryKey[0]),
  },
};

function BarRemovalEvictionRunner() {
  useBarRemovalEviction();
  return null;
}

// The cookie consent banner waits until the age gate is confirmed (or the
// route is exempt), so an under age visitor is never asked to opt in to
// analytics (spec 0037, AC-15).
function GatedConsentBanner() {
  const state = useAgeGateState();
  return state === "confirmed" || state === "exempt" ? <ConsentBanner /> : null;
}

// Every page part sits inside #app-content so the age gate can make it
// inert; the gate itself renders after it, outside the inert subtree.
function AppContent({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div id={APP_CONTENT_ID} className="flex flex-1 flex-col">
        <NavigationHistoryProvider>{children}</NavigationHistoryProvider>
      </div>
      <AgeGate />
      <GatedConsentBanner />
    </>
  );
}

function subscribeNever() {
  return () => {};
}

// @supabase/supabase-js's old localStorage format stores the session under a
// key shaped "sb-<project-ref>-auth-token"; without this one time step,
// every existing visitor's anonymous session (and the pantry/favorites/
// ratings/comments tied to its user_id) becomes unreachable the moment the
// browser client starts reading cookies instead of localStorage, since
// ensureAnonymousSession would silently mint a brand new anonymous user.
function carryOverLegacySession() {
  const legacyKey = Object.keys(window.localStorage).find(
    (key) => key.startsWith("sb-") && key.endsWith("-auth-token"),
  );
  if (!legacyKey) return; // nothing to carry over, e.g. a first time visitor

  try {
    const stored = JSON.parse(window.localStorage.getItem(legacyKey) ?? "null");
    if (stored?.access_token && stored?.refresh_token) {
      supabase.auth.setSession({
        access_token: stored.access_token,
        refresh_token: stored.refresh_token,
      });
    }
  } finally {
    window.localStorage.removeItem(legacyKey);
  }
}

// True only once mounted in a real browser, matching consent-banner.tsx's
// established pattern for this: the server snapshot is always false, so SSR
// and Next's static prerender pass agree, and the client re-renders true
// right after hydration with no cascading setState-in-effect (avoids the
// react-hooks/set-state-in-effect lint rule this repo enforces).
function useHasMounted() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const { session } = useSession();
  const lastUserIdRef = useRef<string | null | undefined>(undefined);

  // PersistQueryClientProvider doesn't establish its QueryClient context
  // synchronously on Next.js's server-executed static prerender pass, so any
  // descendant "use client" component calling useQueryClient/useQuery there
  // throws ("No QueryClient set") even though everything works fine once
  // hydrated in a real browser. A plain QueryClientProvider (used until the
  // client has mounted) doesn't have this problem, so it's the SSR/prerender
  // fallback; the same queryClient instance is reused for both so no state
  // or in-flight query is lost when persistence takes over post-mount.
  const hasMounted = useHasMounted();

  // Shared-terminal cache safety (web only, per the umbrella spec's Cross
  // child contract): a back-bar browser terminal is a named web use case
  // unlike mobile's one-phone-per-person default, so the entire persisted
  // cache is cleared on sign-out and whenever the signed-in user changes,
  // so a departing bartender's bar data is never rehydrated for the next
  // person who signs in on the same browser.
  useEffect(() => {
    const currentUserId = session?.user.id ?? null;

    if (lastUserIdRef.current === undefined) {
      lastUserIdRef.current = currentUserId;
      return;
    }

    if (lastUserIdRef.current !== currentUserId) {
      const cache = queryClient.getQueryCache();
      for (const query of cache.getAll()) {
        if (
          typeof query.queryKey[0] === "string" &&
          PERSISTED_QUERY_KEY_PREFIXES.includes(query.queryKey[0])
        ) {
          queryClient.removeQueries({ queryKey: query.queryKey });
        }
      }
      lastUserIdRef.current = currentUserId;
    }
  }, [session?.user.id, queryClient]);

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

    carryOverLegacySession();
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

  if (!hasMounted) {
    return (
      <QueryClientProvider client={queryClient}>
        <AppContent>{children}</AppContent>
      </QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={PERSIST_OPTIONS}>
      <BarRemovalEvictionRunner />
      <AppContent>{children}</AppContent>
    </PersistQueryClientProvider>
  );
}
