import { useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, View } from "react-native";

import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useCurrentBar } from "@/service/use-current-bar";
import { useInviteStaff } from "@/service/use-bar-mutations";

// Send-side of the invite flow (AC-2). Owner only, per RLS on bar_invites:
// a staff member attempting to insert an invite is denied server side, so
// this screen doesn't need its own role check beyond the empty state below.
export default function BarInviteScreen() {
  const theme = useTheme();
  const currentBar = useCurrentBar();
  const [email, setEmail] = useState("");
  const barId = currentBar.currentBar?.id;
  const inviteStaff = useInviteStaff(barId ?? "");
  const isOwner = currentBar.currentBar !== null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton />
        <Text variant="display">Invite staff</Text>

        {!isOwner ? (
          <EmptyState
            title="No bar selected"
            description="Create or join a bar first, then invite staff by email."
          />
        ) : (
          <View style={styles.form}>
            <Text variant="body" muted>
              {`Inviting to ${currentBar.currentBar?.name}`}
            </Text>
            <Input
              label="Email"
              placeholder="staff@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Button
              disabled={email.trim() === "" || inviteStaff.isPending}
              onPress={() => inviteStaff.mutate(email.trim(), { onSuccess: () => setEmail("") })}
            >
              {inviteStaff.isPending ? "Sending..." : "Send invite"}
            </Button>
            {inviteStaff.isSuccess && (
              <Text variant="bodySmall" style={{ color: theme.text }}>
                Invite sent. It expires in 14 days if not accepted.
              </Text>
            )}
            {inviteStaff.isError && (
              <Text variant="bodySmall" style={{ color: theme.danger }}>
                Couldn&apos;t send that invite. They may already have a pending invite to this bar,
                or you may not be its owner.
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
