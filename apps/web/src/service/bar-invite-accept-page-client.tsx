"use client";

import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { useSession } from "@/auth/use-session";
import { usePendingInvites } from "@/service/use-pending-invites";
import { useAcceptInvite } from "@/service/use-bar-mutations";

// Accept-side of the invite flow (AC-2), web variant: an in-app list of the
// signed-in user's pending invites (via list_my_pending_invites), not a
// pasted invite id like mobile, per this spec's web build plan step 9.
// accept_bar_invite itself enforces the linked account requirement and the
// email match; this screen only surfaces its error states.
export function BarInviteAcceptPageClient() {
  const { isLinked } = useSession();
  const pendingInvites = usePendingInvites();
  const acceptInvite = useAcceptInvite();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-four px-four py-six">
      <BackButton />
      <Text variant="display">Join a bar</Text>

      {!isLinked ? (
        <Text variant="body" muted>
          Sign in with a real account first, then come back to accept your invite.
        </Text>
      ) : pendingInvites.isPending ? (
        <div className="flex items-center justify-center py-six">
          <Spinner label="Loading invites" />
        </div>
      ) : pendingInvites.error ? (
        <EmptyState
          title="Couldn't load invites"
          description="Check your connection and try again."
          action={<Button onClick={() => pendingInvites.refetch()}>Retry</Button>}
        />
      ) : (pendingInvites.data ?? []).length === 0 ? (
        <EmptyState
          title="No pending invites"
          description="Ask a bar owner to invite you by the email address you're signed in with."
        />
      ) : (
        <div className="flex flex-col gap-two">
          {(pendingInvites.data ?? []).map((invite) => (
            <Card key={invite.id} className="flex items-center justify-between gap-three">
              <Text variant="body">{invite.barName}</Text>
              <Button
                disabled={acceptInvite.isPending}
                onClick={() => acceptInvite.mutate(invite.id)}
              >
                {acceptInvite.isPending ? "Joining..." : "Join"}
              </Button>
            </Card>
          ))}
        </div>
      )}

      {acceptInvite.isSuccess && (
        <Text variant="bodySmall">
          You&apos;re in. Head to Service to see this bar&apos;s menu.
        </Text>
      )}
      {acceptInvite.isError && (
        <Text variant="bodySmall" className="text-danger">
          That invite isn&apos;t valid anymore. It may have expired or already been accepted.
        </Text>
      )}
    </div>
  );
}
