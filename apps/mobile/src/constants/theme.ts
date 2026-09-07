// Design tokens, sourced from packages/shared/src/tokens.ts (the single
// cross platform source of truth; see docs/design/design.md and spec 0003).

import { Platform } from "react-native";
import {
  colors as sharedColors,
  spacing as sharedSpacing,
  radii as sharedRadii,
  typeScale as sharedTypeScale,
  fonts as sharedFonts,
  type ColorTokens,
} from "@bartendingapp/shared";

export const Colors = sharedColors;
export type ThemeColor = keyof ColorTokens;

export const Spacing = sharedSpacing;
export const Radii = sharedRadii;
export const TypeScale = sharedTypeScale;

export const Fonts = Platform.select({
  ios: {
    display: sharedFonts.display,
    body: sharedFonts.body,
    mono: "ui-monospace",
  },
  default: {
    display: sharedFonts.display,
    body: sharedFonts.body,
    mono: "monospace",
  },
});

/**
 * Compatibility shim for the pre-existing Expo scaffold screens
 * (src/app/index.tsx, explore.tsx, themed-text.tsx, themed-view.tsx),
 * which reference Colors.backgroundElement / Colors.backgroundSelected.
 * Not part of the new semantic token set; remove once those screens are
 * rebuilt against the real design system (Slice 1: recipe search and detail).
 */
export const LegacyColors = {
  light: {
    text: sharedColors.light.text,
    background: sharedColors.light.bg,
    backgroundElement: sharedColors.light.surface,
    backgroundSelected: sharedColors.light.surfaceSelected,
    textSecondary: sharedColors.light.textMuted,
  },
  dark: {
    text: sharedColors.dark.text,
    background: sharedColors.dark.bg,
    backgroundElement: sharedColors.dark.surface,
    backgroundSelected: sharedColors.dark.surfaceSelected,
    textSecondary: sharedColors.dark.textMuted,
  },
} as const;

export type LegacyThemeColor = keyof typeof LegacyColors.light & keyof typeof LegacyColors.dark;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
