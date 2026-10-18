// Design tokens for direction C「溫暖生活」, approved 2026-10-19 (spec §10.1).
// LIFF uses everything here; Flex messages can only use colors and radii
// (LINE renders Flex in the device's system font).

export type ColorMode = "light" | "dark";

export interface ColorTokens {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  onPrimary: string;
  accent: string;
  accentSoft: string;
  onAccentSoft: string;
  danger: string;
}

export const colors: Record<ColorMode, ColorTokens> = {
  light: {
    bg: "#FBF6EE",
    surface: "#FFFDF8",
    surfaceAlt: "#F1E8DB",
    border: "#E6DCCD",
    text: "#2B2420",
    textMuted: "#6B5E55",
    primary: "#B4492A",
    primaryStrong: "#8F3920",
    primarySoft: "#F1E3D6",
    onPrimary: "#FFFFFF",
    accent: "#5B6B3A",
    accentSoft: "#EEF0E4",
    onAccentSoft: "#3E4A26",
    danger: "#A8322D",
  },
  dark: {
    bg: "#1C1714",
    surface: "#26201C",
    surfaceAlt: "#312923",
    border: "#3D342D",
    text: "#F3ECE3",
    textMuted: "#BFB2A5",
    primary: "#E07A55",
    primaryStrong: "#F3B49C",
    primarySoft: "#4A2A1E",
    onPrimary: "#1C1714",
    accent: "#A9B97E",
    accentSoft: "#2F3523",
    onAccentSoft: "#D6E0B8",
    danger: "#F08A80",
  },
};

export const fontFamily = {
  display: "'Noto Serif TC', serif",
  body: "'Noto Sans TC', system-ui, sans-serif",
} as const;

/** Font sizes in px: display/title use the serif face, the rest the sans face. */
export const fontSize = {
  display: 32,
  title: 22,
  heading: 18,
  body: 16,
  caption: 13,
} as const;

/** Spacing scale in px. */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  12: 48,
} as const;

/** Corner radii in px: cards lg, inputs md, chips/buttons pill. */
export const radius = {
  sm: 12,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

/** Minimum height of anything tappable, in px. */
export const minTouchTarget = 44;

const kebab = (key: string) =>
  key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** CSS custom properties for one color mode, e.g. `--color-surface-alt`. */
export function cssVariables(mode: ColorMode): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors[mode])) {
    vars[`--color-${kebab(key)}`] = value;
  }
  if (mode === "light") {
    for (const [key, value] of Object.entries(fontFamily))
      vars[`--font-${key}`] = value;
    for (const [key, value] of Object.entries(fontSize))
      vars[`--font-size-${key}`] = `${value}px`;
    for (const [key, value] of Object.entries(space))
      vars[`--space-${key}`] = `${value}px`;
    for (const [key, value] of Object.entries(radius))
      vars[`--radius-${key}`] = `${value}px`;
  }
  return vars;
}

/** A stylesheet: light tokens on :root, dark colors under prefers-color-scheme. */
export function tokensCss(): string {
  const block = (vars: Record<string, string>) =>
    Object.entries(vars)
      .map(([name, value]) => `  ${name}: ${value};`)
      .join("\n");
  return [
    `:root {\n${block(cssVariables("light"))}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root {\n${block(cssVariables("dark")).replace(/^/gm, "  ")}\n  }\n}`,
  ].join("\n");
}
