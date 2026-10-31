import { useState } from "react";
import { SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet } from "react-native";

import { useTheme } from "@/hooks/use-theme";
import { Input, type InputProps } from "./input";

export type PasswordInputProps = Omit<InputProps, "secureTextEntry" | "trailing">;

export function PasswordInput(props: PasswordInputProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <Input
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      secureTextEntry={!visible}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? t("common.hidePassword") : t("common.showPassword")}
          accessibilityState={{ selected: visible }}
          style={styles.touchTarget}
          onPress={() => setVisible((current) => !current)}
        >
          <SymbolView
            name={
              visible
                ? { ios: "eye.slash", android: "visibility_off", web: "visibility_off" }
                : { ios: "eye", android: "visibility", web: "visibility" }
            }
            size={20}
            tintColor={theme.textMuted}
          />
        </Pressable>
      }
    />
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
