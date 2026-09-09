import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useColorScheme } from "react-native";

import { LegacyColors } from "@/constants/theme";

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = LegacyColors[scheme === "light" ? "light" : "dark"];

  return (
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
  );
}
