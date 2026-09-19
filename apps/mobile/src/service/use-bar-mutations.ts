import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  acceptInvite,
  createBar,
  createBarRecipe,
  deleteBarRecipe,
  inviteStaff,
  leaveBar,
  revokeInvite,
  setMenuItem,
  toggleStock,
  updateBartenderModeEnabled,
  type CreateBarRecipeInput,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { myBarsQueryKey } from "./use-my-bars";
import { barServiceDataQueryKey } from "./use-bar-service-data";
import { profileQueryKey } from "@/auth/use-preferences";

export function useCreateBar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => createBar(supabase, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: myBarsQueryKey });
    },
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inviteId: string) => {
      const result = await acceptInvite(supabase, inviteId);
      await updateBartenderModeEnabled(supabase, true);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: myBarsQueryKey });
      queryClient.invalidateQueries({ queryKey: profileQueryKey });
    },
  });
}

export function useLeaveBar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (barId: string) => leaveBar(supabase, barId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: myBarsQueryKey });
    },
  });
}

export function useInviteStaff(barId: string) {
  return useMutation({
    mutationFn: (email: string) => inviteStaff(supabase, barId, email),
  });
}

export function useRevokeInvite() {
  return useMutation({
    mutationFn: (inviteId: string) => revokeInvite(supabase, inviteId),
  });
}

export function useToggleStock(barId: string) {
  const queryClient = useQueryClient();
  const queryKey = barServiceDataQueryKey(barId);

  return useMutation({
    mutationFn: ({ ingredientId, is86d }: { ingredientId: string; is86d: boolean }) =>
      toggleStock(supabase, barId, ingredientId, is86d),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

export function useCreateBarRecipe(barId: string) {
  const queryClient = useQueryClient();
  const queryKey = barServiceDataQueryKey(barId);

  return useMutation({
    mutationFn: (input: CreateBarRecipeInput) => createBarRecipe(supabase, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

export function useDeleteBarRecipe(barId: string) {
  const queryClient = useQueryClient();
  const queryKey = barServiceDataQueryKey(barId);

  return useMutation({
    mutationFn: (barRecipeId: string) => deleteBarRecipe(supabase, barRecipeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

export function useSetMenuItem(barId: string) {
  const queryClient = useQueryClient();
  const queryKey = barServiceDataQueryKey(barId);

  return useMutation({
    mutationFn: ({
      barRecipeId,
      sortOrder,
      active,
    }: {
      barRecipeId: string;
      sortOrder: number;
      active: boolean;
    }) => setMenuItem(supabase, barId, barRecipeId, sortOrder, active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
