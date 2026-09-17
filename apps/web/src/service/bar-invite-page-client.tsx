"use client";

import { useState } from "react";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Text } from "@/components/text";
import { useCurrentBar } from "@/service/use-current-bar";
import { useInviteStaff } from "@/service/use-bar-mutations";

// Send-side of the invite flow (AC-2). Owner only, per RLS on bar_invites:
// a staff member attempting to insert an invite is denied server side, so
// this screen doesn't need its own role check beyond the empty state below.
export function BarInvitePageClient() {
  const currentBar = useCurrentBar();
  const [email, setEmail] = useState("");
  const barId = currentBar.currentBar?.id;
  const inviteStaff = useInviteStaff(barId ?? "");
  const isOwner = currentBar.currentBar !== null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-four px-four py-six">
      <BackButton />
      <Text variant="display">Invite staff</Text>

      {!isOwner ? (
        <EmptyState
          title="No bar selected"
          description="Create or join a bar first, then invite staff by email."
        />
      ) : (
        <div className="flex flex-col gap-two">
          <Text variant="body" muted>
            {`Inviting to ${currentBar.currentBar?.name}`}
          </Text>
          <Input
            label="Email"
            placeholder="staff@example.com"
            autoCapitalize="none"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button
            disabled={email.trim() === "" || inviteStaff.isPending}
            onClick={() => inviteStaff.mutate(email.trim(), { onSuccess: () => setEmail("") })}
          >
            {inviteStaff.isPending ? "Sending..." : "Send invite"}
          </Button>
          {inviteStaff.isSuccess && (
            <Text variant="bodySmall">Invite sent. It expires in 14 days if not accepted.</Text>
          )}
          {inviteStaff.isError && (
            <Text variant="bodySmall" className="text-danger">
              Couldn&apos;t send that invite. They may already have a pending invite to this bar, or
              you may not be its owner.
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
