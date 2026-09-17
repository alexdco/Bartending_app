import { useQuery } from "@tanstack/react-query";
import { listMyPendingInvites } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/auth/use-session";

export const pendingInvitesQueryKey = ["pending-invites"] as const;

export function usePendingInvites() {
  const { isLinked } = useSession();

  return useQuery({
    queryKey: pendingInvitesQueryKey,
    queryFn: () => listMyPendingInvites(supabase),
    enabled: isLinked,
  });
}
