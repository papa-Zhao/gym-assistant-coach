import { describe, expect, it } from "vitest";
import { themeCss } from "./theme";

/** Returns the declarations of the first rule whose selector is exactly `selector`. */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`));
  if (!match) throw new Error(`rule not found: ${selector}`);
  return match[1]!;
}

describe("themeCss control borders", () => {
  const css = themeCss();

  it("outlines bar tracks with the 3:1 border so the empty part is visible", () => {
    expect(rule(css, ".bar-track")).toContain(
      "inset 0 0 0 1px var(--color-border-strong)",
    );
  });

  it("uses the strong border for the add-set and pill-link buttons", () => {
    expect(rule(css, "button.add-set")).toContain(
      "dashed var(--color-border-strong)",
    );
    expect(rule(css, ".card-links a.pill-link")).toContain(
      "solid var(--color-border-strong)",
    );
  });
});
