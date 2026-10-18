import { describe, expect, it } from "vitest";
import { colors, cssVariables, tokensCss, type ColorMode } from "./tokens";

// WCAG 2.x relative luminance and contrast ratio.
function channel(hex: string, offset: number): number {
  const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  return (
    0.2126 * channel(hex, 1) +
    0.7152 * channel(hex, 3) +
    0.0722 * channel(hex, 5)
  );
}
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const modes: ColorMode[] = ["light", "dark"];

describe("color tokens", () => {
  it("light and dark define the same keys", () => {
    expect(Object.keys(colors.dark).sort()).toEqual(
      Object.keys(colors.light).sort(),
    );
  });

  it.each(modes)("%s: text pairs meet WCAG AA (4.5:1)", (mode) => {
    const c = colors[mode];
    const pairs: [string, string][] = [
      [c.text, c.bg],
      [c.text, c.surface],
      [c.textMuted, c.bg],
      [c.textMuted, c.surface],
      [c.onPrimary, c.primary],
      [c.primaryStrong, c.primarySoft],
      [c.onAccentSoft, c.accentSoft],
      [c.danger, c.surface],
    ];
    for (const [fg, bg] of pairs) {
      expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("cssVariables", () => {
  it("kebab-cases color keys and adds scales in light mode", () => {
    const vars = cssVariables("light");
    expect(vars["--color-surface-alt"]).toBe("#F1E8DB");
    expect(vars["--radius-lg"]).toBe("24px");
    expect(vars["--font-size-body"]).toBe("16px");
  });

  it("dark mode only overrides colors", () => {
    const vars = cssVariables("dark");
    expect(vars["--color-bg"]).toBe("#1C1714");
    expect(Object.keys(vars).every((k) => k.startsWith("--color-"))).toBe(true);
  });

  it("tokensCss puts dark colors under prefers-color-scheme", () => {
    const css = tokensCss();
    expect(css).toMatch(/^:root \{/);
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain("--color-primary: #E07A55;");
  });
});
