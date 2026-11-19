"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { BlockedUser } from "@bartendingapp/shared";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { useBlockedUsers, useUnblockUser } from "./use-blocks";

/** The Blocked people list on the account page (spec 0062 AC-15). */
export function BlockedPeopleCard() {
  const t = useTranslations("account");
  const { data, error, isPending } = useBlockedUsers();

  return (
    <Card>
      <div className="flex flex-col gap-two">
        <Text variant="heading" as="h2">
          {t("blocked.heading")}
        </Text>
        {error ? (
          <Text variant="bodySmall" muted>
            {t("blocked.loadFailed")}
          </Text>
        ) : isPending ? (
          <Spinner label={t("blocked.loading")} />
        ) : data.length === 0 ? (
          <Text variant="body" muted>
            {t("blocked.empty")}
          </Text>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {data.map((person) => (
              <li key={person.blockedId}>
                <BlockedPersonRow person={person} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function BlockedPersonRow({ person }: { person: BlockedUser }) {
  const t = useTranslations("account");
  const format = useFormatter();
  const unblock = useUnblockUser();
  const name = person.displayName ?? t("blocked.deletedUser");
  const failed = unblock.data?.error != null;

  return (
    <div className="flex flex-col gap-one py-two">
      <div className="flex items-center justify-between gap-two">
        <div className="flex flex-col">
          <Text variant="label">{name}</Text>
          <Text variant="bodySmall" muted>
            {t("blocked.blockedOn", {
              date: format.dateTime(new Date(person.createdAt), { dateStyle: "medium" }),
            })}
          </Text>
        </div>
        <Button
          variant="secondary"
          disabled={unblock.isPending}
          onClick={() => unblock.mutate(person.blockedId)}
          aria-label={t("blocked.unblockLabel", { name })}
        >
          {t("blocked.unblock")}
        </Button>
      </div>
      {failed && (
        <Text variant="bodySmall" className="text-danger" role="alert">
          {t("blocked.unblockFailed")}
        </Text>
      )}
    </div>
  );
}
