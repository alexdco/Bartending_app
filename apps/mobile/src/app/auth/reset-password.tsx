import { useState } from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { AuthError, completePasswordReset } from "@bartendingapp/shared";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Input } from "@/components/input";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const completeReset = useMutation({
    mutationFn: (newPassword: string) => completePasswordReset(supabase, newPassword),
    onSuccess: () => router.replace("/account"),
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.centered}>
        <Card style={styles.card}>
          <Text variant="heading">Set a new password</Text>
          <Input
            label="New password"
            secureTextEntry
            autoComplete="new-password"
            value={password}
            onChangeText={setPassword}
          />
          {completeReset.isError && (
            <Text variant="bodySmall" style={{ color: theme.danger }}>
              {completeReset.error instanceof AuthError &&
              completeReset.error.reason === "weak_password"
                ? "Password must be at least 6 characters."
                : "Something went wrong. Check your connection and try again."}
            </Text>
          )}
          <Button disabled={completeReset.isPending} onPress={() => completeReset.mutate(password)}>
            {completeReset.isPending ? "Saving…" : "Save new password"}
          </Button>
        </Card>
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
  card: {
    gap: Spacing.two,
    width: "100%",
  },
});
