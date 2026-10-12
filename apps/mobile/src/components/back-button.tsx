import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet } from "react-native";

import { useTheme } from "@/hooks/use-theme";

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

// Back when there is a screen behind this one, else home, so Back never
// dead ends on a deep link (spec 0038 AC-8).
export function goBackOrHome(router: ReturnType<typeof useRouter>): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/");
  }
}

export function BackButton() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("common.back")}
      hitSlop={HIT_SLOP}
      style={styles.touchTarget}
      onPress={() => goBackOrHome(router)}
    >
      <SymbolView
        name={{ ios: "chevron.left", android: "arrow_back", web: "arrow_back" }}
        size={22}
        tintColor={theme.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touchTarget: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
