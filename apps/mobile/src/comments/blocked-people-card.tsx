import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import type { BlockedUser } from "@bartendingapp/shared";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useActiveLocale } from "@/i18n";
import { useBlockedUsers, useUnblockUser } from "./use-blocks";

/** The Blocked people list on the account screen (spec 0062 AC-15, AC-17). */
export function BlockedPeopleCard() {
  const theme = useTheme();
  const { t } = useTranslation();
  const locale = useActiveLocale();
  const { data, error, isPending } = useBlockedUsers();
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
    [locale],
  );

  return (
    <Card style={styles.card}>
      <Text variant="heading" accessibilityRole="header">
        {t("account.blocked.heading")}
      </Text>
      {error ? (
        <Text variant="bodySmall" muted>
          {t("account.blocked.loadFailed")}
        </Text>
      ) : isPending ? (
        <Spinner label={t("account.blocked.loading")} />
      ) : data.length === 0 ? (
        <Text variant="body" muted>
          {t("account.blocked.empty")}
        </Text>
      ) : (
        <View>
          {data.map((person, index) => (
            <View
              key={person.blockedId}
              style={index > 0 ? [styles.divided, { borderTopColor: theme.border }] : undefined}
            >
              <BlockedPersonRow person={person} dateFormatter={dateFormatter} />
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function BlockedPersonRow({
  person,
  dateFormatter,
}: {
  person: BlockedUser;
  dateFormatter: Intl.DateTimeFormat;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const unblock = useUnblockUser();
  const name = person.displayName ?? t("account.blocked.deletedUser");
  const failed = unblock.data?.error != null;

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <View style={styles.rowText}>
          <Text variant="label">{name}</Text>
          <Text variant="bodySmall" muted>
            {t("account.blocked.blockedOn", {
              date: dateFormatter.format(new Date(person.createdAt)),
            })}
          </Text>
        </View>
        <Button
          variant="secondary"
          disabled={unblock.isPending}
          onPress={() => unblock.mutate(person.blockedId)}
          accessibilityLabel={t("account.blocked.unblockLabel", { name })}
        >
          {t("account.blocked.unblock")}
        </Button>
      </View>
      {failed && (
        <Text variant="bodySmall" style={{ color: theme.danger }} accessibilityLiveRegion="polite">
          {t("account.blocked.unblockFailed")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  rowText: {
    flex: 1,
  },
});
