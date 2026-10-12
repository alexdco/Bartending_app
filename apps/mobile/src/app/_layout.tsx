import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ensureAnonymousSession } from "@bartendingapp/shared";
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import { I18nextProvider } from "react-i18next";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import AppTabs from "@/components/app-tabs";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/auth/use-session";
import { identify, initAnalytics } from "@/analytics/posthog-client";
import { AgeGateOverlay } from "@/age-gate/age-gate-overlay";
import { useAgeGate } from "@/age-gate/use-age-gate";
import { i18n, initI18n } from "@/i18n";
import { useBarRemovalEviction } from "@/service/use-bar-removal-eviction";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Bartender Mode's offline requirement (spec 0023-quick-build-mode.md,
// AC-6): a bartender's already opened recipes must render with no network
// connection even after the app is fully closed and reopened, which an in
// memory QueryClient alone can't do. Only the query keys Quick Build Mode
// and the Service screen actually need offline are persisted (see
// shouldDehydrateQuery below); everything else in the app keeps the plain
// in memory cache behavior it already has.
const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "bartenderModeQueryCache",
});

const PERSISTED_QUERY_KEY_PREFIXES = ["bar-service-data", "quick-build-recipe"];

const PERSIST_OPTIONS = {
  persister: asyncStoragePersister,
  // Bump this when a persisted query's shape changes incompatibly, so a
  // stale shape from a previous build is never deserialized (per this
  // spec's "buster key tied to the app version" requirement).
  buster: "bartender-mode-v1",
  maxAge: 24 * 60 * 60 * 1000,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { queryKey: readonly unknown[] }) =>
      typeof query.queryKey[0] === "string" &&
      PERSISTED_QUERY_KEY_PREFIXES.includes(query.queryKey[0]),
  },
};

// Mounted inside PersistQueryClientProvider so it can call useQueryClient();
// runs on mount and on every foreground while a linked session exists.
function BarRemovalEvictionRunner() {
  useBarRemovalEviction();
  return null;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { session } = useSession();
  const [i18nReady, setI18nReady] = useState(false);
  const ageGate = useAgeGate();
  const ageConfirmed = ageGate.state === "confirmed";

  useEffect(() => {
    initI18n().then(() => setI18nReady(true));
  }, []);

  // Analytics start only after the age gate is confirmed (spec 0037, AC-15).
  useEffect(() => {
    if (!ageConfirmed) return;
    initAnalytics();
    if (session?.user.id) {
      identify(session.user.id);
    }
  }, [ageConfirmed, session?.user.id]);

  useEffect(() => {
    ensureAnonymousSession(supabase).catch((error) => {
      console.error("Failed to establish a guest session", error);
    });

    let sawLinkedSession = false;

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session?.user && !session.user.is_anonymous) {
        sawLinkedSession = true;
      }

      if (event === "SIGNED_OUT") {
        if (!sawLinkedSession) {
          // A lapsed anonymous session has no account to sign back into; silently
          // re-bootstrap rather than surface a sign in prompt.
          ensureAnonymousSession(supabase).catch((error) => {
            console.error("Failed to re-establish a guest session", error);
          });
        }
        sawLinkedSession = false;
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  // The gate read runs alongside i18n setup, so it adds no splash time.
  if (!i18nReady || !ageGate.ready) {
    return null;
  }

  return (
    <I18nextProvider i18n={i18n}>
      <PersistQueryClientProvider client={queryClient} persistOptions={PERSIST_OPTIONS}>
        <BarRemovalEvictionRunner />
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <AnimatedSplashOverlay />
          <AppTabs />
          <AgeGateOverlay state={ageGate.state} onConfirm={ageGate.confirm} onDeny={ageGate.deny} />
        </ThemeProvider>
      </PersistQueryClientProvider>
    </I18nextProvider>
  );
}
