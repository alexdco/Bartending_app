"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthError, completePasswordReset } from "@bartendingapp/shared";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Input } from "@/components/input";
import { Text } from "@/components/text";
import { supabase } from "@/lib/supabase";

export function ResetPasswordPageClient() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const completeReset = useMutation({
    mutationFn: (newPassword: string) => completePasswordReset(supabase, newPassword),
    onSuccess: () => router.replace("/account"),
  });

  return (
    <div className="flex flex-1 items-center justify-center p-six">
      <Card>
        <form
          className="flex flex-col gap-three"
          onSubmit={(event) => {
            event.preventDefault();
            completeReset.mutate(password);
          }}
        >
          <Text variant="heading" as="h2">
            Set a new password
          </Text>
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {completeReset.isError && (
            <Text variant="bodySmall" className="text-danger" role="alert">
              {completeReset.error instanceof AuthError &&
              completeReset.error.reason === "weak_password"
                ? "Password must be at least 6 characters."
                : "Something went wrong. Check your connection and try again."}
            </Text>
          )}
          <Button type="submit" disabled={completeReset.isPending}>
            {completeReset.isPending ? "Saving…" : "Save new password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
