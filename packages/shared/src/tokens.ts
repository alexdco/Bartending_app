// Design tokens: the single source of truth for both apps' styling systems.
// Values documented in docs/design/design.md; that file is the human reference,
// this module is authoritative if the two ever drift.

export interface ColorTokens {
  bg: string;
  surface: string;
  surfaceSelected: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string;
  focus: string;
  danger: string;
  dangerText: string;
}

export const colors: { dark: ColorTokens; light: ColorTokens } = {
  dark: {
    bg: "#12100E",
    surface: "#1C1815",
    surfaceSelected: "#2A2420",
    border: "#79695A",
    text: "#F5EFE7",
    textMuted: "#B8AA9A",
    accent: "#D98E3E",
    accentText: "#12100E",
    focus: "#E8AC5E",
    danger: "#F5716F",
    dangerText: "#2B0605",
  },
  light: {
    bg: "#FBF9F6",
    surface: "#FFFFFF",
    surfaceSelected: "#F2E9DE",
    border: "#8C7C68",
    text: "#1C1815",
    textMuted: "#6B5F52",
    accent: "#8A4C15",
    accentText: "#FFFFFF",
    focus: "#8A4C15",
    danger: "#C4362B",
    dangerText: "#FFFFFF",
  },
};

export type ThemeName = keyof typeof colors;

export const spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const radii = {
  small: 6,
  medium: 12,
  large: 20,
  full: 9999,
} as const;

export interface TypeScaleEntry {
  size: number;
  lineHeight: number;
}

export const typeScale = {
  display: { size: 32, lineHeight: 1.15 },
  heading: { size: 24, lineHeight: 1.2 },
  subheading: { size: 18, lineHeight: 1.3 },
  body: { size: 16, lineHeight: 1.5 },
  bodySmall: { size: 14, lineHeight: 1.45 },
  label: { size: 13, lineHeight: 1.3 },
} as const satisfies Record<string, TypeScaleEntry>;

export const fonts = {
  display: "Fraunces",
  body: "Inter",
  displayFallback: ["Georgia", '"Times New Roman"', "serif"].join(", "),
  bodyFallback: ["ui-sans-serif", "system-ui", "-apple-system", "sans-serif"].join(", "),
} as const;

/** Every text/background pair the design system verifies for WCAG AA contrast. Checked by tokens.test.ts. */
export const verifiedContrastPairs: ReadonlyArray<{
  name: string;
  theme: ThemeName;
  foreground: keyof ColorTokens;
  background: keyof ColorTokens;
  minRatio: number;
}> = [
  { name: "text on bg", theme: "dark", foreground: "text", background: "bg", minRatio: 4.5 },
  { name: "text on bg", theme: "light", foreground: "text", background: "bg", minRatio: 4.5 },
  {
    name: "text on surface",
    theme: "dark",
    foreground: "text",
    background: "surface",
    minRatio: 4.5,
  },
  {
    name: "text on surface",
    theme: "light",
    foreground: "text",
    background: "surface",
    minRatio: 4.5,
  },
  {
    name: "textMuted on bg",
    theme: "dark",
    foreground: "textMuted",
    background: "bg",
    minRatio: 4.5,
  },
  {
    name: "textMuted on bg",
    theme: "light",
    foreground: "textMuted",
    background: "bg",
    minRatio: 4.5,
  },
  {
    name: "textMuted on surface",
    theme: "dark",
    foreground: "textMuted",
    background: "surface",
    minRatio: 4.5,
  },
  {
    name: "textMuted on surface",
    theme: "light",
    foreground: "textMuted",
    background: "surface",
    minRatio: 4.5,
  },
  {
    name: "accentText on accent",
    theme: "dark",
    foreground: "accentText",
    background: "accent",
    minRatio: 4.5,
  },
  {
    name: "accentText on accent",
    theme: "light",
    foreground: "accentText",
    background: "accent",
    minRatio: 4.5,
  },
  {
    name: "dangerText on danger",
    theme: "dark",
    foreground: "dangerText",
    background: "danger",
    minRatio: 4.5,
  },
  {
    name: "dangerText on danger",
    theme: "light",
    foreground: "dangerText",
    background: "danger",
    minRatio: 4.5,
  },
  {
    name: "border on surface",
    theme: "dark",
    foreground: "border",
    background: "surface",
    minRatio: 3,
  },
  {
    name: "border on surface",
    theme: "light",
    foreground: "border",
    background: "surface",
    minRatio: 3,
  },
  {
    name: "focus on surface",
    theme: "dark",
    foreground: "focus",
    background: "surface",
    minRatio: 3,
  },
  {
    name: "focus on surface",
    theme: "light",
    foreground: "focus",
    background: "surface",
    minRatio: 3,
  },
];
