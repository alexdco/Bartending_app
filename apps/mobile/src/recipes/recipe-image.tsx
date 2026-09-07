import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

import { Radii } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export interface RecipeImageProps {
  uri: string | null;
  style?: object;
}

// TODO: missing asset: a dedicated cocktail glass placeholder image; this renders a
// glyph-based fallback in the design system's surface tokens until one is added.
export function RecipeImage({ uri, style }: RecipeImageProps) {
  const theme = useTheme();

  if (!uri) {
    return (
      <View
        style={[
          styles.fallback,
          { backgroundColor: theme.surface, borderColor: theme.border },
          style,
        ]}
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
