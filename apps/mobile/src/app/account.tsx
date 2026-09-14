import { useEffect, useState } from "react";
import { ScrollView, SafeAreaView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ExternalLink } from "@/components/external-link";
import { Input } from "@/components/input";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  AuthError,
  PRIVACY_POLICY_URL,
  getInitials,
  avatarSize,
  type Locale,
} from "@bartendingapp/shared";
import { useSession } from "@/auth/use-session";
import { useProfile, useUpdateDisplayName, useUpdateLocale } from "@/auth/use-preferences";
import {
  useChangeEmail,
  useDeleteAccount,
  useRequestPasswordReset,
  useSignIn,
  useSignOut,
  useSignUp,
} from "@/auth/use-auth-mutations";
import { changeLocale, useActiveLocale } from "@/i18n";

const localeValues: Locale[] = ["en", "es"];

function useAuthErrorMessage() {
  const { t } = useTranslation();

  return (error: unknown): string => {
    if (error instanceof AuthError) {
      switch (error.reason) {
        case "weak_password":
          return t("account.errorWeakPassword");
        case "invalid_credentials":
          return t("account.errorInvalidCredentials");
        case "email_already_registered":
          return t("account.errorEmailAlreadyRegistered");
        case "no_session":
          return t("account.errorNoSession");
        default:
          return t("account.errorGeneric");
      }
    }
    return t("account.errorGeneric");
  };
}

function LanguageCard() {
  const { t } = useTranslation();
  const activeLocale = useActiveLocale();
  const { isLinked } = useSession();
  const updateLocale = useUpdateLocale();

  const switchLocale = (next: Locale) => {
    void changeLocale(next);
    if (isLinked) {
      updateLocale.mutate(next);
    }
  };

  return (
    <Card style={styles.card}>
      <Text variant="heading">{t("menu.language")}</Text>
      <View style={styles.languageRow}>
        {localeValues.map((value) => (
          <Button
            key={value}
            variant={value === activeLocale ? "primary" : "secondary"}
            onPress={() => switchLocale(value)}
          >
            {t(`language.${value}`)}
          </Button>
        ))}
      </View>
    </Card>
  );
}

function GuestAuthForm({
  onSignedUpWithUnsavedName,
}: {
  onSignedUpWithUnsavedName: (name: string) => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const authErrorMessage = useAuthErrorMessage();
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
        title={t("account.checkYourInbox")}
        description={t("account.checkEmailToFinish")}
      />
    );
  }

  return (
    <Card style={styles.card}>
      <Text variant="heading">
        {mode === "sign-in" ? t("account.signIn") : t("account.createAccount")}
      </Text>
      <Input
        label={t("account.email")}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
      />
      <Input
        label={t("account.password")}
        secureTextEntry
        autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
        value={password}
        onChangeText={setPassword}
      />
      {mode === "sign-up" && (
        <Input
          label={t("account.nameOptional")}
          autoComplete="name"
          value={name}
          onChangeText={setName}
        />
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
        {active.isPending
          ? t("account.pleaseWait")
          : mode === "sign-in"
            ? t("account.signIn")
            : t("account.createAccountAction")}
      </Button>
      <Button
        variant="secondary"
        onPress={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
      >
        {mode === "sign-in"
          ? t("account.needAccountSignUp")
          : t("account.alreadyHaveAccountSignIn")}
      </Button>
    </Card>
  );
}

function DisplayNameCard({ email, prefillName }: { email: string; prefillName: string }) {
  const theme = useTheme();
  const { t } = useTranslation();
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
      <Text variant="heading">{t("account.name")}</Text>
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
          <Input label={t("account.displayName")} value={name} onChangeText={setEditedName} />
        </View>
      </View>
      {updateDisplayName.data?.error && (
        <Text variant="bodySmall" style={{ color: theme.danger }}>
          {updateDisplayName.data.error.reason === "too_long"
            ? t("account.nameTooLong")
            : updateDisplayName.data.error.reason === "too_short"
              ? t("account.nameTooShort")
              : t("account.nameSaveFailed")}
        </Text>
      )}
      <Button
        variant="secondary"
        disabled={updateDisplayName.isPending}
        onPress={() => updateDisplayName.mutate(name)}
      >
        {updateDisplayName.isPending ? t("account.saving") : t("account.saveName")}
      </Button>
    </Card>
  );
}

function LinkedAccountPanel({ email, prefillName }: { email: string; prefillName: string }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const authErrorMessage = useAuthErrorMessage();
  const [newEmail, setNewEmail] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const signOut = useSignOut();
  const requestPasswordReset = useRequestPasswordReset();
  const changeEmail = useChangeEmail();
  const deleteAccount = useDeleteAccount();

  return (
    <View style={styles.section}>
      <Card style={styles.card}>
        <Text variant="heading">{t("account.signedIn")}</Text>
        <Text variant="body" muted>
          {email}
        </Text>
        <Button variant="secondary" disabled={signOut.isPending} onPress={() => signOut.mutate()}>
          {signOut.isPending ? t("account.signingOut") : t("account.signOut")}
        </Button>
      </Card>

      <DisplayNameCard email={email} prefillName={prefillName} />

      <Card style={styles.card}>
        <Text variant="heading">{t("account.changeEmail")}</Text>
        <Input
          label={t("account.newEmail")}
          keyboardType="email-address"
          autoCapitalize="none"
          value={newEmail}
          onChangeText={setNewEmail}
        />
        {changeEmail.isSuccess && (
          <Text variant="bodySmall" muted>
            {t("account.checkNewEmailToConfirm")}
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
          {changeEmail.isPending ? t("account.saving") : t("account.updateEmail")}
        </Button>
      </Card>

      <Card style={styles.card}>
        <Text variant="heading">{t("account.changePassword")}</Text>
        <Text variant="bodySmall" muted>
          {t("account.resetEmailDescription")}
        </Text>
        {requestPasswordReset.isSuccess && (
          <Text variant="bodySmall" muted>
            {t("account.checkEmailForResetLink")}
          </Text>
        )}
        <Button
          variant="secondary"
          disabled={requestPasswordReset.isPending}
          onPress={() => requestPasswordReset.mutate(email)}
        >
          {requestPasswordReset.isPending
            ? t("account.sendingResetEmail")
            : t("account.sendResetEmail")}
        </Button>
      </Card>

      <Card style={styles.card}>
        <Text variant="heading">{t("account.deleteAccount")}</Text>
        <Text variant="bodySmall" muted>
          {t("account.deleteAccountDescription")}
        </Text>
        <Input
          label={t("account.typeDeleteToConfirm")}
          value={confirmText}
          onChangeText={setConfirmText}
        />
        {deleteAccount.isError && (
          <Text variant="bodySmall" style={{ color: theme.danger }}>
            {t("account.deleteAccountFailed")}
          </Text>
        )}
        <Button
          variant="secondary"
          disabled={confirmText !== "DELETE" || deleteAccount.isPending}
          onPress={() => deleteAccount.mutate()}
        >
          {deleteAccount.isPending ? t("account.deleting") : t("account.deleteMyAccount")}
        </Button>
      </Card>
    </View>
  );
}

export default function AccountScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { session, isLinked, isLoading, expired } = useSession();
  const [unsavedSignUpName, setUnsavedSignUpName] = useState("");

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="display">{t("account.heading")}</Text>

        <Card style={styles.card}>
          <Button variant="secondary" onPress={() => router.push("/favorites")}>
            {t("account.viewFavorites")}
          </Button>
        </Card>

        <LanguageCard />

        {expired && (
          <EmptyState
            title={t("account.signedOut")}
            description={t("account.sessionExpiredDescription")}
          />
        )}

        {isLoading ? (
          <View style={styles.centered}>
            <Spinner label={t("account.loadingAccount")} />
          </View>
        ) : isLinked && session?.user.email ? (
          <LinkedAccountPanel email={session.user.email} prefillName={unsavedSignUpName} />
        ) : (
          <GuestAuthForm onSignedUpWithUnsavedName={setUnsavedSignUpName} />
        )}

        <Card style={styles.card}>
          <ExternalLink href={PRIVACY_POLICY_URL as `https://${string}` | `http://${string}`}>
            <Text variant="body">{t("account.privacyPolicy")}</Text>
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
  languageRow: {
    flexDirection: "row",
    gap: Spacing.two,
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
