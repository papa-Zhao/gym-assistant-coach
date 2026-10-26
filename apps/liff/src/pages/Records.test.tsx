import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BodyMetricsResponse } from "@gac/shared";
import { configureApi } from "../api";
import { Records } from "./Records";

const DATA: BodyMetricsResponse = {
  from: "2026-09-20",
  to: "2026-10-19",
  points: [
    { date: "2026-09-21", weightKg: 73.6, bodyFatPct: null, waistCm: null },
    { date: "2026-10-19", weightKg: 72.4, bodyFatPct: null, waistCm: null },
  ],
};

const WEEK = { from: "2026-10-19", to: "2026-10-25", sessions: 3 };

describe("Records", () => {
  let DATA_NOW: BodyMetricsResponse;
  const paths: string[] = [];

  beforeEach(() => {
    paths.length = 0;
    DATA_NOW = DATA;
    configureApi({
      apiUrl: "https://api.test",
      fetchImpl: (async (url: string) => {
        paths.push(url.replace("https://api.test", ""));
        return new Response(
          JSON.stringify(
            url.includes("/workouts/week")
              ? WEEK
              : url.includes("/meals")
                ? { date: "2026-10-19", meals: [], consumed: { kcal: 0 } }
                : url.includes("/profile")
                  ? { profile: null, targets: null }
                  : DATA_NOW,
          ),
        );
      }) as unknown as typeof fetch,
      relogin: async () => ({ kind: "error" }),
    });
  });

  it("shows latest weight and links to body page", async () => {
    render(<Records onFatal={vi.fn()} />);
    expect(await screen.findByText("72.4")).toBeInTheDocument();
    expect(screen.getByText("30 天內 −1.2 kg")).toBeInTheDocument();
    expect(paths).toEqual(
      expect.arrayContaining(["/body-metrics?days=30", "/workouts/week"]),
    );
    expect(screen.getByRole("link", { name: /身體數據/ })).toHaveAttribute(
      "href",
      "/records/body",
    );
  });

  it("one weight record shows a single-record note without a dash unit", async () => {
    DATA_NOW = {
      ...DATA,
      points: [DATA.points[1]!],
    };
    render(<Records onFatal={vi.fn()} />);
    expect(await screen.findByText("72.4")).toBeInTheDocument();
    expect(screen.getByText("目前只有一筆紀錄")).toBeInTheDocument();
    expect(screen.queryByText(/— kg/)).not.toBeInTheDocument();
  });

  it("shows the meals card instead of a coming-soon diet button", async () => {
    render(<Records onFatal={vi.fn()} />);
    await screen.findByText("72.4");
    expect(await screen.findAllByText("＋ 記錄")).toHaveLength(3);
    expect(screen.queryByText("即將推出")).not.toBeInTheDocument();
  });

  it("training card links to /workout and /records/workouts", async () => {
    render(<Records onFatal={vi.fn()} />);
    expect(await screen.findByText("本週訓練 3 次")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /記訓練/ })).toHaveAttribute(
      "href",
      "/workout",
    );
    expect(screen.getByRole("link", { name: /看紀錄/ })).toHaveAttribute(
      "href",
      "/records/workouts",
    );
    // Both links sit in one row styled with 44 px tap targets.
    expect(screen.getByRole("link", { name: /記訓練/ }).parentElement).toBe(
      screen.getByRole("link", { name: /看紀錄/ }).parentElement,
    );
    expect(
      screen.getByRole("link", { name: /記訓練/ }).parentElement,
    ).toHaveClass("card-links");
  });
});
