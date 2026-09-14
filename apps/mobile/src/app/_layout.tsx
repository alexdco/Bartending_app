import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { identify } from "@/analytics/posthog-client";
import { i18n, initI18n } from "@/i18n";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { session } = useSession();
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    initI18n().then(() => setI18nReady(true));
  }, []);

  useEffect(() => {
    if (session?.user.id) {
      identify(session.user.id);
    }
  }, [session?.user.id]);

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

  if (!i18nReady) {
    return null;
  }

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <AnimatedSplashOverlay />
          <AppTabs />
        </ThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
