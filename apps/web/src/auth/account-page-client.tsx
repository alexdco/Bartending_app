"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthError, getInitials } from "@bartendingapp/shared";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { useSession } from "./use-session";
import { useProfile, useUpdateDisplayName } from "./use-preferences";
import {
  useChangeEmail,
  useDeleteAccount,
  useRequestPasswordReset,
  useSignIn,
  useSignOut,
  useSignUp,
} from "./use-auth-mutations";

function useAuthErrorMessage() {
  const t = useTranslations("account");

  return (error: unknown): string => {
    if (error instanceof AuthError) {
      switch (error.reason) {
        case "weak_password":
          return t("errorWeakPassword");
        case "invalid_credentials":
          return t("errorInvalidCredentials");
        case "email_already_registered":
          return t("errorEmailAlreadyRegistered");
        case "no_session":
          return t("errorNoSession");
        default:
          return t("errorGeneric");
      }
    }
    return t("errorGeneric");
  };
}

function GuestAuthForm({
  onSignedUpWithUnsavedName,
}: {
  onSignedUpWithUnsavedName: (name: string) => void;
}) {
  const t = useTranslations("account");
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
    return <EmptyState title={t("checkYourInbox")} description={t("checkEmailToFinish")} />;
  }

  return (
    <Card>
      <form
        className="flex flex-col gap-three"
        onSubmit={(event) => {
          event.preventDefault();
          if (mode === "sign-up") {
            signUp.mutate({ email, password, name });
          } else {
            signIn.mutate({ email, password });
          }
        }}
      >
        <Text variant="heading" as="h2">
          {mode === "sign-in" ? t("signIn") : t("createAccount")}
        </Text>
        <Input
          label={t("email")}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          label={t("password")}
          type="password"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {mode === "sign-up" && (
          <Input
            label={t("nameOptional")}
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
        {active.isError && (
          <Text variant="bodySmall" className="text-danger" role="alert">
            {authErrorMessage(active.error)}
          </Text>
        )}
        <Button type="submit" disabled={active.isPending}>
          {active.isPending
            ? t("pleaseWait")
            : mode === "sign-in"
              ? t("signIn")
              : t("createAccountAction")}
        </Button>
        <button
          type="button"
          className="text-body-small text-text-muted underline"
          onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
        >
          {mode === "sign-in" ? t("needAccountSignUp") : t("alreadyHaveAccountSignIn")}
        </button>
      </form>
    </Card>
  );
}

function DisplayNameCard({ email, prefillName }: { email: string; prefillName: string }) {
  const t = useTranslations("account");
  const { data: profile } = useProfile();
  const updateDisplayName = useUpdateDisplayName();
  const [editedName, setEditedName] = useState<string | null>(
    prefillName.length > 0 ? prefillName : null,
  );

  // Not yet touched by the user: show the loaded value (or blank while loading), never write it into state directly.
  const name = editedName ?? profile?.displayName ?? "";

  const previewInitials = getInitials(name, email);

  return (
    <Card>
      <form
        className="flex flex-col gap-two"
        onSubmit={(event) => {
          event.preventDefault();
          updateDisplayName.mutate(name);
        }}
      >
        <Text variant="heading" as="h2">
          {t("name")}
        </Text>
        <div className="flex items-center gap-three">
          <span
            aria-hidden="true"
            className="flex items-center justify-center rounded-full bg-accent text-accent-text"
            style={{ width: 32, height: 32 }}
          >
            <Text variant="label">{previewInitials}</Text>
          </span>
          <Input
            label={t("displayName")}
            type="text"
            value={name}
            onChange={(event) => setEditedName(event.target.value)}
          />
        </div>
        {updateDisplayName.data?.error && (
          <Text variant="bodySmall" className="text-danger" role="alert">
            {updateDisplayName.data.error.reason === "too_long"
              ? t("nameTooLong")
              : updateDisplayName.data.error.reason === "too_short"
                ? t("nameTooShort")
                : t("nameSaveFailed")}
          </Text>
        )}
        <Button type="submit" variant="secondary" disabled={updateDisplayName.isPending}>
          {updateDisplayName.isPending ? t("saving") : t("saveName")}
        </Button>
      </form>
    </Card>
  );
}

function LinkedAccountPanel({ email, prefillName }: { email: string; prefillName: string }) {
  const t = useTranslations("account");
  const authErrorMessage = useAuthErrorMessage();
  const [newEmail, setNewEmail] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const signOut = useSignOut();
  const requestPasswordReset = useRequestPasswordReset();
  const changeEmail = useChangeEmail();
  const deleteAccount = useDeleteAccount();

  return (
    <div className="flex flex-col gap-four">
      <Card>
        <div className="flex flex-col gap-two">
          <Text variant="heading" as="h2">
            {t("signedIn")}
          </Text>
          <Text variant="body" muted>
            {email}
          </Text>
          <Button variant="secondary" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
            {signOut.isPending ? t("signingOut") : t("signOut")}
          </Button>
        </div>
      </Card>

      <DisplayNameCard email={email} prefillName={prefillName} />

      <Card>
        <form
          className="flex flex-col gap-two"
          onSubmit={(event) => {
            event.preventDefault();
            changeEmail.mutate(newEmail);
          }}
        >
          <Text variant="heading" as="h2">
            {t("changeEmail")}
          </Text>
          <Input
            label={t("newEmail")}
            type="email"
            required
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
          />
          {changeEmail.isSuccess && (
            <Text variant="bodySmall" muted>
              {t("checkNewEmailToConfirm")}
            </Text>
          )}
          {changeEmail.isError && (
            <Text variant="bodySmall" className="text-danger" role="alert">
              {authErrorMessage(changeEmail.error)}
            </Text>
          )}
          <Button type="submit" variant="secondary" disabled={changeEmail.isPending}>
            {changeEmail.isPending ? t("saving") : t("updateEmail")}
          </Button>
        </form>
      </Card>

      <Card>
        <div className="flex flex-col gap-two">
          <Text variant="heading" as="h2">
            {t("changePassword")}
          </Text>
          <Text variant="bodySmall" muted>
            {t("resetEmailDescription")}
          </Text>
          {requestPasswordReset.isSuccess && (
            <Text variant="bodySmall" muted>
              {t("checkEmailForResetLink")}
            </Text>
          )}
          <Button
            variant="secondary"
            onClick={() => requestPasswordReset.mutate(email)}
            disabled={requestPasswordReset.isPending}
          >
            {requestPasswordReset.isPending ? t("sendingResetEmail") : t("sendResetEmail")}
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-two">
          <Text variant="heading" as="h2">
            {t("deleteAccount")}
          </Text>
          <Text variant="bodySmall" muted>
            {t("deleteAccountDescription")}
          </Text>
          <Input
            label={t("typeDeleteToConfirm")}
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
          />
          {deleteAccount.isError && (
            <Text variant="bodySmall" className="text-danger" role="alert">
              {t("deleteAccountFailed")}
            </Text>
          )}
          <Button
            variant="secondary"
            className="border-danger text-danger"
            disabled={confirmText !== "DELETE" || deleteAccount.isPending}
            onClick={() => deleteAccount.mutate()}
          >
            {deleteAccount.isPending ? t("deleting") : t("deleteMyAccount")}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function AccountPageClient() {
  const t = useTranslations("account");
  const { session, isLinked, isLoading, expired } = useSession();
  const [unsavedSignUpName, setUnsavedSignUpName] = useState("");

  return (
    <div className="flex flex-col gap-four p-six">
      <Text variant="display" as="h1">
        {t("heading")}
      </Text>

      {expired && (
        <EmptyState title={t("signedOut")} description={t("sessionExpiredDescription")} />
      )}

      {isLoading ? (
        <div className="flex justify-center py-six">
          <Spinner label={t("loadingAccount")} />
        </div>
      ) : isLinked && session?.user.email ? (
        <LinkedAccountPanel email={session.user.email} prefillName={unsavedSignUpName} />
      ) : (
        <GuestAuthForm onSignedUpWithUnsavedName={setUnsavedSignUpName} />
      )}
    </div>
  );
}
