"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchPreferences,
  fetchProfile,
  updatePreferences,
  updateDisplayName,
  type Theme,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export const preferencesQueryKey = ["preferences"] as const;
export const profileQueryKey = ["profile"] as const;

export function usePreferences() {
  return useQuery({
    queryKey: preferencesQueryKey,
    queryFn: () => fetchPreferences(supabase),
  });
}

export function useProfile() {
  return useQuery({
    queryKey: profileQueryKey,
    queryFn: () => fetchProfile(supabase),
  });
}

export function useUpdateDisplayName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (rawValue: string) => updateDisplayName(supabase, rawValue),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileQueryKey }),
  });
}

export function useUpdatePreference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (theme: Theme) => updatePreferences(supabase, theme),
    onMutate: async (theme) => {
      await queryClient.cancelQueries({ queryKey: preferencesQueryKey });
      const previousTheme = queryClient.getQueryData<Theme>(preferencesQueryKey);
      queryClient.setQueryData(preferencesQueryKey, theme);
      return { previousTheme };
    },
    onError: (_error, _theme, context) => {
      if (context) {
        queryClient.setQueryData(preferencesQueryKey, context.previousTheme);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: preferencesQueryKey }),
  });
}
