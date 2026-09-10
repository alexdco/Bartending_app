import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, useColorScheme, View } from "react-native";

import { LegacyColors, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useSession } from "@/auth/use-session";
import { useProfile } from "@/auth/use-preferences";
import { Text } from "@/components/text";
import { avatarSize, getInitials } from "@bartendingapp/shared";

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

function HeaderBadge() {
  const theme = useTheme();
  const router = useRouter();
  const { session, isLinked, isLoading } = useSession();
  const { data: profile } = useProfile();

  if (isLoading) {
    return <View style={styles.header} />;
  }

  const initials = getInitials(profile?.displayName ?? null, session?.user.email ?? null);

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isLinked ? "Account" : "Account (signed out)"}
        hitSlop={HIT_SLOP}
        style={styles.badgeTouchTarget}
        onPress={() => router.push("/account")}
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
    </View>
  );
}

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = LegacyColors[scheme === "light" ? "light" : "dark"];

  return (
    <View style={styles.container}>
      <HeaderBadge />
      <NativeTabs
        backgroundColor={colors.background}
        indicatorColor={colors.backgroundElement}
        labelStyle={{ selected: { color: colors.text } }}
      >
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            src={require("@/assets/images/tabIcons/home.png")}
            renderingMode="template"
          />
        </NativeTabs.Trigger>

        {/* TODO: missing asset: a dedicated search tab icon; reusing explore.png as a placeholder per the engineer's call */}
        <NativeTabs.Trigger name="search">
          <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            src={require("@/assets/images/tabIcons/explore.png")}
            renderingMode="template"
          />
        </NativeTabs.Trigger>

        {/* TODO: missing asset: a dedicated pantry tab icon; reusing home.png as a placeholder per the engineer's call */}
        <NativeTabs.Trigger name="pantry">
          <NativeTabs.Trigger.Label>Pantry</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            src={require("@/assets/images/tabIcons/home.png")}
            renderingMode="template"
          />
        </NativeTabs.Trigger>

        {/* TODO: missing asset: a dedicated drink ideas tab icon; reusing explore.png as a placeholder per the engineer's call */}
        <NativeTabs.Trigger name="drink-ideas">
          <NativeTabs.Trigger.Label>Drink ideas</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            src={require("@/assets/images/tabIcons/explore.png")}
            renderingMode="template"
          />
        </NativeTabs.Trigger>

        {/* TODO: missing asset: a dedicated popular tab icon; reusing explore.png as a placeholder per the engineer's call */}
        <NativeTabs.Trigger name="popular">
          <NativeTabs.Trigger.Label>Popular</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            src={require("@/assets/images/tabIcons/explore.png")}
            renderingMode="template"
          />
        </NativeTabs.Trigger>

        {/* TODO: missing asset: a dedicated account tab icon; reusing home.png as a placeholder per the engineer's call */}
        <NativeTabs.Trigger name="account">
          <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            src={require("@/assets/images/tabIcons/home.png")}
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
});
