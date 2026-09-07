import { Text as RNText, type TextProps as RNTextProps } from "react-native";

import { Fonts, TypeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type Variant = "display" | "heading" | "subheading" | "body" | "bodySmall" | "label";

export interface TextProps extends RNTextProps {
  variant?: Variant;
  muted?: boolean;
}

export function Text({ variant = "body", muted = false, style, ...rest }: TextProps) {
  const theme = useTheme();
  const scale = TypeScale[variant];
  const isDisplay = variant === "display" || variant === "heading" || variant === "subheading";

  return (
    <RNText
      style={[
        {
          fontSize: scale.size,
          lineHeight: scale.size * scale.lineHeight,
          fontFamily: isDisplay ? Fonts?.display : Fonts?.body,
          fontWeight: isDisplay ? "600" : "400",
          color: muted ? theme.textMuted : theme.text,
        },
        style,
      ]}
      {...rest}
    />
  );
}
