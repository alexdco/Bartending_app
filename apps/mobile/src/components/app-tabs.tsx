import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, StyleSheet, useColorScheme, View } from "react-native";

import { Colors, LegacyColors, Radii, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useSession } from "@/auth/use-session";
import { useProfile } from "@/auth/use-preferences";
import { useSignOut } from "@/auth/use-auth-mutations";
import { Text } from "@/components/text";
import { avatarSize, getInitials } from "@bartendingapp/shared";

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

function AccountMenu({
  visible,
  onClose,
  onSignOut,
}: {
  visible: boolean;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.menuAnchor}>
          <View
            style={[styles.menu, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Pressable
              accessibilityRole="button"
              style={styles.menuItem}
              onPress={() => {
                onClose();
                router.push("/account");
              }}
            >
              <Text variant="label" style={{ color: theme.text }}>
                Account
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.menuItem}
              onPress={() => {
                onClose();
                onSignOut();
              }}
            >
              <Text variant="label" style={{ color: theme.text }}>
                Sign out
              </Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

function HeaderBadge() {
  const theme = useTheme();
  const router = useRouter();
  const { session, isLinked, isLoading } = useSession();
  const { data: profile } = useProfile();
  const signOut = useSignOut();
  const [menuVisible, setMenuVisible] = useState(false);

  if (isLoading) {
    return <View style={styles.header} />;
  }

  const initials = getInitials(profile?.displayName ?? null, session?.user.email ?? null);

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isLinked ? "Account menu" : "Sign in"}
        hitSlop={HIT_SLOP}
        style={styles.badgeTouchTarget}
        onPress={() => (isLinked ? setMenuVisible(true) : router.push("/account"))}
      >
        {isLinked ? (
          <View
            style={[
              styles.badge,
              {
                width: avatarSize.mobile,
                height: avatarSize.mobile,
                backgroundColor: theme.accent,
              },
            ]}
          >
            <Text variant="label" style={{ color: theme.accentText }}>
              {initials}
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.badge,
              {
                width: avatarSize.mobile,
                height: avatarSize.mobile,
                backgroundColor: theme.surfaceSelected,
              },
            ]}
          >
            <SymbolView
              name={{ ios: "person.fill", android: "person", web: "person" }}
              size={16}
              tintColor={theme.textMuted}
            />
          </View>
        )}
      </Pressable>
      {isLinked ? (
        <AccountMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          onSignOut={() => signOut.mutate()}
        />
      ) : null}
    </View>
  );
}

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = LegacyColors[scheme === "light" ? "light" : "dark"];
  const accent = Colors[scheme === "light" ? "light" : "dark"].accent;
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <HeaderBadge />
      <NativeTabs
        backgroundColor={colors.background}
        indicatorColor={accent}
        labelStyle={{ selected: { color: accent } }}
      >
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>{t("nav.home")}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            src={require("@/assets/images/tabIcons/home.png")}
            renderingMode="template"
          />
        </NativeTabs.Trigger>

        {/* TODO: missing asset: a dedicated search tab icon; reusing explore.png as a placeholder per the engineer's call */}
        <NativeTabs.Trigger name="search">
          <NativeTabs.Trigger.Label>{t("nav.search")}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            src={require("@/assets/images/tabIcons/explore.png")}
            renderingMode="template"
          />
        </NativeTabs.Trigger>

        {/* TODO: missing asset: a dedicated pantry tab icon; reusing home.png as a placeholder per the engineer's call */}
        <NativeTabs.Trigger name="pantry">
          <NativeTabs.Trigger.Label>{t("nav.pantry")}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            src={require("@/assets/images/tabIcons/home.png")}
            renderingMode="template"
          />
        </NativeTabs.Trigger>

        {/* TODO: missing asset: a dedicated drink ideas tab icon; reusing explore.png as a placeholder per the engineer's call */}
        <NativeTabs.Trigger name="drink-ideas">
          <NativeTabs.Trigger.Label>{t("nav.drinkIdeas")}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            src={require("@/assets/images/tabIcons/explore.png")}
            renderingMode="template"
          />
        </NativeTabs.Trigger>

        {/* TODO: missing asset: a dedicated popular tab icon; reusing explore.png as a placeholder per the engineer's call */}
        <NativeTabs.Trigger name="popular">
          <NativeTabs.Trigger.Label>{t("nav.popular")}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            src={require("@/assets/images/tabIcons/explore.png")}
            renderingMode="template"
          />
        </NativeTabs.Trigger>
      </NativeTabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  badgeTouchTarget: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    flex: 1,
  },
  menuAnchor: {
    alignItems: "flex-end",
    paddingTop: 56,
    paddingRight: Spacing.three,
  },
  menu: {
    minWidth: 160,
    borderRadius: Radii.medium,
    borderWidth: 1,
    paddingVertical: Spacing.two,
  },
  menuItem: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
});
