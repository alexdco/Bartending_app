import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, View } from "react-native";

import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useSession } from "@/auth/use-session";
import { useAcceptInvite } from "@/service/use-bar-mutations";

// Accept-side of the invite flow (AC-2). An invite id (from the invite email
// or a shared link, once either exists as a real delivery channel) is
// entered manually for MVP; accept_bar_invite itself enforces the linked
// account requirement and the email match, so this screen only surfaces its
// error states, it doesn't re-check them.
export default function BarInviteAcceptScreen() {
  const theme = useTheme();
  const { isLinked } = useSession();
  const params = useLocalSearchParams<{ inviteId?: string }>();
  const [inviteId, setInviteId] = useState(params.inviteId ?? "");
  const acceptInvite = useAcceptInvite();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton />
        <Text variant="display">Join a bar</Text>

        {!isLinked ? (
          <Text variant="body" muted>
            Sign in with a real account first, then come back to accept your invite.
          </Text>
        ) : (
          <View style={styles.form}>
            <Input
              label="Invite ID"
              placeholder="Paste the invite ID from your email"
              autoCapitalize="none"
              value={inviteId}
              onChangeText={setInviteId}
            />
            <Button
              disabled={inviteId.trim() === "" || acceptInvite.isPending}
              onPress={() => acceptInvite.mutate(inviteId.trim())}
            >
              {acceptInvite.isPending ? "Joining..." : "Join bar"}
            </Button>
            {acceptInvite.isSuccess && (
              <Text variant="bodySmall" style={{ color: theme.text }}>
                You&apos;re in. Head to Service to see this bar&apos;s menu.
              </Text>
            )}
            {acceptInvite.isError && (
              <Text variant="bodySmall" style={{ color: theme.danger }}>
                That invite isn&apos;t valid. It may be expired, already used, or sent to a
                different email address than the one you&apos;re signed in with.
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: Spacing.four,
    padding: Spacing.four,
  },
  form: {
    gap: Spacing.two,
  },
});
