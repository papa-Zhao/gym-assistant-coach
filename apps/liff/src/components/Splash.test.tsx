import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { colors } from "@gac/shared";
import indexHtml from "../../index.html?raw";
import { App } from "../App";
import { themeCss } from "../theme";
import { Logo } from "./Splash";

describe("Splash", () => {
  it("splash shows logo and app name while logging in", () => {
    render(
      <App
        state={{ kind: "loading" }}
        pathname="/profile"
        today="2026-10-21"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("img", { name: "對話教練" })).toBeInTheDocument();
    expect(screen.getByText("Gym Assistant Coach")).toBeInTheDocument();
    expect(screen.getByText("正在準備你的資料…")).toBeInTheDocument();
    expect(screen.queryByText("載入中…")).not.toBeInTheDocument();
  });

  it("index.html has static splash inside root", () => {
    const doc = new DOMParser().parseFromString(indexHtml, "text/html");
    const staticRoot = doc.getElementById("root") as HTMLElement;
    // Re-render the markup in the live document so role queries work.
    const root = render(
      <div dangerouslySetInnerHTML={{ __html: staticRoot.innerHTML }} />,
    ).container;
    expect(within(root).getByRole("img", { name: "對話教練" })).toBeTruthy();
    expect(within(root).getByText("Gym Assistant Coach")).toBeTruthy();
    expect(within(root).getByText("正在準備你的資料…")).toBeTruthy();

    // Same mark as the React logo.
    const { container } = render(<Logo size={96} />);
    const shapes = (el: ParentNode) =>
      [...el.querySelectorAll("svg *")].map((n) =>
        [n.tagName, ...[...n.attributes].map((a) => `${a.name}=${a.value}`)]
          .join(" ")
          .toLowerCase(),
      );
    expect(shapes(root)).toEqual(shapes(container));

    // Every colour is a design-token value.
    const tokens = new Set(
      [...Object.values(colors.light), ...Object.values(colors.dark)].map((c) =>
        c.toLowerCase(),
      ),
    );
    const used = indexHtml.match(/#[0-9a-f]{6}\b/gi) ?? [];
    expect(used.length).toBeGreaterThan(0);
    for (const c of used) expect(tokens).toContain(c.toLowerCase());
  });

  it("stops the breathing and shimmer animations for reduced motion", () => {
    const reduced = themeCss().split("prefers-reduced-motion: reduce")[1];
    expect(reduced).toMatch(/\.splash-logo/);
    expect(reduced).toMatch(/\.skeleton::after/);
  });
});
