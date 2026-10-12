import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  BackHandler,
  StyleSheet,
  View,
  findNodeHandle,
  type Text as RNText,
} from "react-native";
import { useTranslation } from "react-i18next";
import { PRIVACY_POLICY_URL, type AgeGateState } from "@bartendingapp/shared";

import { Button } from "@/components/button";
import { ExternalLink } from "@/components/external-link";
import { Text } from "@/components/text";
import { Radii, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

// Full screen age confirmation (spec 0037, AC-11, AC-13, AC-14, AC-17).
// Rendered after the splash overlay so it sits above it and above AppTabs,
// which stays mounted underneath and keeps any deep link target.

type Props = {
  readonly state: AgeGateState;
  readonly onConfirm: () => void;
  readonly onDeny: () => void;
};

export function AgeGateOverlay({ state, onConfirm, onDeny }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const titleRef = useRef<RNText>(null);
  const visible = state === "ask" || state === "denied";

  // The Android back button does nothing while the gate shows.
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [visible]);

  // Move screen reader focus to the title whenever the panel changes.
  useEffect(() => {
    if (!visible) return;
    const node = findNodeHandle(titleRef.current);
    if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
  }, [visible, state]);

  if (!visible) return null;

  const denied = state === "denied";

  return (
    <View
      style={[styles.overlay, { backgroundColor: theme.bg }]}
      accessibilityViewIsModal
      importantForAccessibility="yes"
    >
      <View
        style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}
        accessibilityRole="none"
      >
        <Text ref={titleRef} variant="heading" accessibilityRole="header">
          {t(denied ? "ageGate.blockedTitle" : "ageGate.title")}
        </Text>
        <Text variant="body">{t(denied ? "ageGate.blockedBody" : "ageGate.question")}</Text>

        {denied ? (
          <ExternalLink href={PRIVACY_POLICY_URL as `https://${string}` | `http://${string}`}>
            <Text variant="label" style={styles.link}>
              {t("ageGate.privacyLink")}
            </Text>
          </ExternalLink>
        ) : (
          <View style={styles.actions}>
            <Button onPress={onConfirm}>{t("ageGate.yes")}</Button>
            <Button variant="secondary" onPress={onDeny}>
              {t("ageGate.no")}
            </Button>
          </View>
        )}

        <Text variant="bodySmall" muted>
          {t("ageGate.responsibleDrinking")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.four,
    zIndex: 2000,
    elevation: 2000,
  },
  panel: {
    width: "100%",
    maxWidth: 420,
    gap: Spacing.four,
    padding: Spacing.six,
    borderRadius: Radii.large,
    borderWidth: 1,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  link: {
    textDecorationLine: "underline",
  },
});
