import { useState } from "react";
import { ScrollView, SafeAreaView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ExternalLink } from "@/components/external-link";
import { Input } from "@/components/input";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { AuthError, PRIVACY_POLICY_URL } from "@bartendingapp/shared";
import { useSession } from "@/auth/use-session";
import {
  useChangeEmail,
  useDeleteAccount,
  useRequestPasswordReset,
  useSignIn,
  useSignOut,
  useSignUp,
} from "@/auth/use-auth-mutations";

function authErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    switch (error.reason) {
      case "weak_password":
        return "Password must be at least 6 characters.";
      case "invalid_credentials":
        return "Incorrect email or password.";
      case "email_already_registered":
        return "Check your email to finish creating your account, or sign in if you already have one.";
      case "no_session":
        return "We couldn't verify your session. Check your connection and try again.";
      default:
        return "Something went wrong. Check your connection and try again.";
    }
  }
  return "Something went wrong. Check your connection and try again.";
}

function GuestAuthForm() {
  const theme = useTheme();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signIn = useSignIn();
  const signUp = useSignUp();

  const active = mode === "sign-in" ? signIn : signUp;

  if (mode === "sign-up" && signUp.isSuccess) {
    return (
      <EmptyState
        title="Check your inbox"
        description="Check your email to finish creating your account, or sign in if you already have one."
      />
    );
  }

  return (
    <Card style={styles.card}>
      <Text variant="heading">{mode === "sign-in" ? "Sign in" : "Create an account"}</Text>
      <Input
        label="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
      />
      <Input
        label="Password"
        secureTextEntry
        autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
        value={password}
        onChangeText={setPassword}
      />
      {active.isError && (
        <Text variant="bodySmall" style={{ color: theme.danger }}>
          {authErrorMessage(active.error)}
        </Text>
      )}
      <Button disabled={active.isPending} onPress={() => active.mutate({ email, password })}>
        {active.isPending ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
      </Button>
      <Button
        variant="secondary"
        onPress={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
      >
        {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
      </Button>
    </Card>
  );
}

function LinkedAccountPanel({ email }: { email: string }) {
  const theme = useTheme();
  const [newEmail, setNewEmail] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const signOut = useSignOut();
  const requestPasswordReset = useRequestPasswordReset();
  const changeEmail = useChangeEmail();
  const deleteAccount = useDeleteAccount();

  return (
    <View style={styles.section}>
      <Card style={styles.card}>
        <Text variant="heading">Signed in</Text>
        <Text variant="body" muted>
          {email}
        </Text>
        <Button variant="secondary" disabled={signOut.isPending} onPress={() => signOut.mutate()}>
          {signOut.isPending ? "Signing out…" : "Sign out"}
        </Button>
      </Card>

      <Card style={styles.card}>
        <Text variant="heading">Change email</Text>
        <Input
          label="New email"
          keyboardType="email-address"
          autoCapitalize="none"
          value={newEmail}
          onChangeText={setNewEmail}
        />
        {changeEmail.isSuccess && (
          <Text variant="bodySmall" muted>
            Check your new email to confirm the change.
          </Text>
        )}
        {changeEmail.isError && (
          <Text variant="bodySmall" style={{ color: theme.danger }}>
            {authErrorMessage(changeEmail.error)}
          </Text>
        )}
        <Button
          variant="secondary"
          disabled={changeEmail.isPending}
          onPress={() => changeEmail.mutate(newEmail)}
        >
          {changeEmail.isPending ? "Saving…" : "Update email"}
        </Button>
      </Card>

      <Card style={styles.card}>
        <Text variant="heading">Change password</Text>
        <Text variant="bodySmall" muted>
          We&apos;ll email you a link to set a new password.
        </Text>
        {requestPasswordReset.isSuccess && (
          <Text variant="bodySmall" muted>
            Check your email for a reset link.
          </Text>
        )}
        <Button
          variant="secondary"
          disabled={requestPasswordReset.isPending}
          onPress={() => requestPasswordReset.mutate(email)}
        >
          {requestPasswordReset.isPending ? "Sending…" : "Send reset email"}
        </Button>
      </Card>

      <Card style={styles.card}>
        <Text variant="heading">Delete account</Text>
        <Text variant="bodySmall" muted>
          This permanently deletes your account, pantry, favorites, and preferences. This cannot be
          undone. Type DELETE to confirm.
        </Text>
        <Input label="Type DELETE to confirm" value={confirmText} onChangeText={setConfirmText} />
        {deleteAccount.isError && (
          <Text variant="bodySmall" style={{ color: theme.danger }}>
            We couldn&apos;t delete your account. Check your connection and try again.
          </Text>
        )}
        <Button
          variant="secondary"
          disabled={confirmText !== "DELETE" || deleteAccount.isPending}
          onPress={() => deleteAccount.mutate()}
        >
          {deleteAccount.isPending ? "Deleting…" : "Delete my account"}
        </Button>
      </Card>
    </View>
  );
}

export default function AccountScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, isLinked, isLoading, expired } = useSession();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="display">Account</Text>

        <Card style={styles.card}>
          <Button variant="secondary" onPress={() => router.push("/favorites")}>
            View favorites
          </Button>
        </Card>

        {expired && (
          <EmptyState
            title="Signed out"
            description="Your session expired. Sign in again to keep syncing your pantry and favorites."
          />
        )}

        {isLoading ? (
          <View style={styles.centered}>
            <Spinner label="Loading account" />
          </View>
        ) : isLinked && session?.user.email ? (
          <LinkedAccountPanel email={session.user.email} />
        ) : (
          <GuestAuthForm />
        )}

        <Card style={styles.card}>
          <ExternalLink href={PRIVACY_POLICY_URL as `https://${string}` | `http://${string}`}>
            <Text variant="body">Privacy Policy</Text>
          </ExternalLink>
        </Card>
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
  section: {
    gap: Spacing.four,
  },
  card: {
    gap: Spacing.two,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.six,
  },
});
