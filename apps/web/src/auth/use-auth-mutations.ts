"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import {
  changeEmail,
  deleteAccount,
  requestPasswordReset,
  signInWithPassword,
  signOutToAnonymous,
  signUpWithPassword,
  type Locale,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

const AUTH_CALLBACK_URL =
  typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : "";

export function useSignUp() {
  return useMutation({
    mutationFn: ({ email, password, name }: { email: string; password: string; name?: string }) =>
      signUpWithPassword(supabase, email, password, name),
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  const locale = useLocale() as Locale;
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signInWithPassword(supabase, email, password, locale),
    onSuccess: () => queryClient.clear(),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => signOutToAnonymous(supabase),
    onSuccess: () => queryClient.clear(),
  });
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (email: string) => requestPasswordReset(supabase, email, AUTH_CALLBACK_URL),
  });
}

export function useChangeEmail() {
  return useMutation({
    mutationFn: (newEmail: string) => changeEmail(supabase, newEmail),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => deleteAccount(supabase),
  });
}
