"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AuthError, completePasswordReset } from "@bartendingapp/shared";
import { useMutation } from "@tanstack/react-query";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { PasswordInput } from "@/components/password-input";
import { Text } from "@/components/text";
import { supabase } from "@/lib/supabase";

export function ResetPasswordPageClient() {
  const t = useTranslations("account");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const completeReset = useMutation({
    mutationFn: (newPassword: string) => completePasswordReset(supabase, newPassword),
    onSuccess: () => router.replace("/account"),
  });

  return (
    <div className="flex flex-1 flex-col gap-four p-six">
      <BackButton fallbackHref="/account" />
      <div className="flex flex-1 items-center justify-center">
        <Card>
          <form
            className="flex flex-col gap-three"
            onSubmit={(event) => {
              event.preventDefault();
              completeReset.mutate(password);
            }}
          >
            <Text variant="heading" as="h2">
              {t("setNewPassword")}
            </Text>
            <PasswordInput
              label={t("newPassword")}
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {completeReset.isError && (
              <Text variant="bodySmall" className="text-danger" role="alert">
                {completeReset.error instanceof AuthError &&
                completeReset.error.reason === "weak_password"
                  ? t("errorWeakPassword")
                  : t("errorGeneric")}
              </Text>
            )}
            <Button type="submit" disabled={completeReset.isPending}>
              {completeReset.isPending ? t("saving") : t("saveNewPassword")}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
