import { useEffect, useState } from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/lib/supabase";

const LINK_EXPIRED_MESSAGE = "This link is invalid or has expired.";

export default function AuthCallbackScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();
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
      .then(async ({ error: exchangeError }) => {
        if (exchangeError) {
          subscription.subscription.unsubscribe();
          setError(LINK_EXPIRED_MESSAGE);
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

        router.replace(isRecovery ? "/auth/reset-password" : "/account");
      })
      .catch(() => {
        subscription.subscription.unsubscribe();
        setError(LINK_EXPIRED_MESSAGE);
      });

    return () => subscription.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.centered}>
        {error ? (
          <EmptyState title="Link expired" description={error} />
        ) : (
          <Spinner label="Signing you in" />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.six,
  },
});
