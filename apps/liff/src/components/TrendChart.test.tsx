import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrendChart } from "./TrendChart";

describe("TrendChart", () => {
  it("single point renders one dot and no line error", () => {
    const pts = [{ date: "2026-10-19", value: 72.4 }];
    const { container } = render(
      <TrendChart
        points={pts}
        average={pts}
        label="體重"
        unit="kg"
        days={30}
      />,
    );
    expect(container.querySelectorAll("circle")).toHaveLength(1);
    expect(container.querySelector("polyline")).toBeNull();
    const cy = container.querySelector("circle")?.getAttribute("cy");
    expect(cy).toBe("80");
  });

  it("aria-label summarizes first and last value", () => {
    const pts = [
      { date: "2026-10-01", value: 73.6 },
      { date: "2026-10-10", value: 73 },
      { date: "2026-10-19", value: 72.4 },
    ];
    const { container } = render(
      <TrendChart
        points={pts}
        average={pts}
        label="體重"
        unit="kg"
        days={30}
      />,
    );
    expect(
      screen.getByRole("img", { name: "體重 30 天趨勢：從 73.6 到 72.4 kg" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("circle")).toHaveLength(3);
    expect(container.querySelector("polyline")).toHaveAttribute(
      "stroke",
      "var(--color-primary)",
    );
  });
});
