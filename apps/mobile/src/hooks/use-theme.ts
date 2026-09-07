/**
 * Resolves the active theme's token set from the OS color scheme.
 * Dark is used whenever the OS reports no preference (spec 0003).
 */

import { Colors, LegacyColors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { ColorTokens } from "@bartendingapp/shared";

function resolveScheme(scheme: ReturnType<typeof useColorScheme>): "dark" | "light" {
  return scheme === "light" ? "light" : "dark";
}

export function useTheme(): ColorTokens {
  const scheme = useColorScheme();
  return Colors[resolveScheme(scheme)];
}

/** @deprecated Compatibility shim for the pre-existing Expo scaffold screens. Use useTheme() in new code. */
export function useLegacyTheme() {
  const scheme = useColorScheme();
  return LegacyColors[resolveScheme(scheme)];
}
