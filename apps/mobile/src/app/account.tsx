import { useEffect, useState } from "react";
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
import { AuthError, PRIVACY_POLICY_URL, getInitials, avatarSize } from "@bartendingapp/shared";
import { useSession } from "@/auth/use-session";
import { useProfile, useUpdateDisplayName } from "@/auth/use-preferences";
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

function GuestAuthForm({
  onSignedUpWithUnsavedName,
}: {
  onSignedUpWithUnsavedName: (name: string) => void;
}) {
  const theme = useTheme();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const signIn = useSignIn();
  const signUp = useSignUp();

  const active = mode === "sign-in" ? signIn : signUp;

  useEffect(() => {
    if (mode === "sign-up" && signUp.isSuccess && !signUp.data.nameSaved) {
      onSignedUpWithUnsavedName(name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signUp.isSuccess, signUp.data]);

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
      {mode === "sign-up" && (
        <Input label="Name (optional)" autoComplete="name" value={name} onChangeText={setName} />
      )}
      {active.isError && (
        <Text variant="bodySmall" style={{ color: theme.danger }}>
          {authErrorMessage(active.error)}
        </Text>
      )}
      <Button
        disabled={active.isPending}
        onPress={() =>
          mode === "sign-up"
            ? signUp.mutate({ email, password, name })
            : signIn.mutate({ email, password })
        }
      >
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

function DisplayNameCard({ email, prefillName }: { email: string; prefillName: string }) {
  const theme = useTheme();
  const { data: profile } = useProfile();
  const updateDisplayName = useUpdateDisplayName();
  const [editedName, setEditedName] = useState<string | null>(
    prefillName.length > 0 ? prefillName : null,
  );

  // Not yet touched by the user: show the loaded value (or blank while loading), never write it into state directly.
  const name = editedName ?? profile?.displayName ?? "";

  const previewInitials = getInitials(name, email);

  return (
    <Card style={styles.card}>
      <Text variant="heading">Name</Text>
      <View style={styles.badgePreviewRow}>
        <View
          style={[
            styles.badge,
            { width: avatarSize.mobile, height: avatarSize.mobile, backgroundColor: theme.accent },
          ]}
        >
          <Text variant="label" style={{ color: theme.accentText }}>
            {previewInitials}
          </Text>
        </View>
        <View style={styles.badgePreviewInput}>
          <Input label="Display name" value={name} onChangeText={setEditedName} />
        </View>
      </View>
      {updateDisplayName.data?.error && (
        <Text variant="bodySmall" style={{ color: theme.danger }}>
          {updateDisplayName.data.error.reason === "too_long"
            ? "Name must be 50 characters or fewer."
            : updateDisplayName.data.error.reason === "too_short"
              ? "Name must be at least 1 character."
              : "We couldn't save your name. Check your connection and try again."}
        </Text>
      )}
      <Button
        variant="secondary"
        disabled={updateDisplayName.isPending}
        onPress={() => updateDisplayName.mutate(name)}
      >
        {updateDisplayName.isPending ? "Saving…" : "Save name"}
      </Button>
    </Card>
  );
}

function LinkedAccountPanel({ email, prefillName }: { email: string; prefillName: string }) {
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

      <DisplayNameCard email={email} prefillName={prefillName} />

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
  const [unsavedSignUpName, setUnsavedSignUpName] = useState("");

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
          <LinkedAccountPanel email={session.user.email} prefillName={unsavedSignUpName} />
        ) : (
          <GuestAuthForm onSignedUpWithUnsavedName={setUnsavedSignUpName} />
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
  badgePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  badgePreviewInput: {
    flex: 1,
  },
  badge: {
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.six,
  },
});
