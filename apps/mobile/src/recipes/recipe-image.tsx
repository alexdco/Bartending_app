import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

import { Radii } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export interface RecipeImageProps {
  uri: string | null;
  style?: object;
  /**
   * Set on the recipe hero so it is announced with the recipe name; leave it
   * unset on cards, where the image is decorative (spec 0038 AC-9).
   */
  accessibilityLabel?: string;
}

function accessibilityProps(label: string | undefined) {
  return label
    ? { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: label }
    : { accessible: false, importantForAccessibility: "no-hide-descendants" as const };
}

// TODO: missing asset: a dedicated cocktail glass placeholder image; this renders a
// glyph-based fallback in the design system's surface tokens until one is added.
export function RecipeImage({ uri, style, accessibilityLabel }: RecipeImageProps) {
  const theme = useTheme();

  if (!uri) {
    return (
      <View
        style={[
          styles.fallback,
          { backgroundColor: theme.surface, borderColor: theme.border },
          style,
        ]}
        {...accessibilityProps(accessibilityLabel)}
      >
        <Text style={[styles.glyph, { color: theme.textMuted }]} accessibilityElementsHidden>
          🍸
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.image, style]}
      contentFit="cover"
      accessibilityIgnoresInvertColors
      {...accessibilityProps(accessibilityLabel)}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    borderRadius: Radii.medium,
  },
  fallback: {
    borderRadius: Radii.medium,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    fontSize: 40,
  },
});
