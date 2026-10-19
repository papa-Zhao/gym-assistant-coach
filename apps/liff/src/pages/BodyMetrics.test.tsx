import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BodyMetricsResponse } from "@gac/shared";
import { configureApi } from "../api";
import { BodyMetrics } from "./BodyMetrics";

const DATA: BodyMetricsResponse = {
  from: "2026-09-20",
  to: "2026-10-19",
  points: [
    { date: "2026-09-21", weightKg: 73.6, bodyFatPct: 20.1, waistCm: null },
    { date: "2026-10-19", weightKg: 72.4, bodyFatPct: 19.7, waistCm: 80 },
  ],
};
const EMPTY: BodyMetricsResponse = {
  from: "2026-09-20",
  to: "2026-10-19",
  points: [],
};

type Call = { method: string; path: string; body: unknown };

describe("BodyMetrics", () => {
  let calls: Call[];
  let current: BodyMetricsResponse;
  const onFatal = vi.fn();

  beforeEach(() => {
    calls = [];
    current = DATA;
    onFatal.mockClear();
    configureApi({
      apiUrl: "https://api.test",
      fetchImpl: (async (url: string, init?: RequestInit) => {
        calls.push({
          method: init?.method ?? "GET",
          path: url.replace("https://api.test", ""),
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return new Response(JSON.stringify(current));
      }) as unknown as typeof fetch,
      relogin: async () => ({ kind: "error" }),
    });
  });

  it("default range is 30 days and calls GET days=30", async () => {
    render(<BodyMetrics onFatal={onFatal} />);
    expect(await screen.findByText("72.4")).toBeInTheDocument();
    expect(calls).toEqual([
      { method: "GET", path: "/body-metrics?days=30", body: undefined },
    ]);
    expect(screen.getByRole("button", { name: "30 天" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("30 天內 −1.2 kg")).toBeInTheDocument();
    expect(screen.getByText("9/21")).toBeInTheDocument();
    expect(screen.getByText("10/19")).toBeInTheDocument();
  });

  it("switching to 7 calls days=7", async () => {
    render(<BodyMetrics onFatal={onFatal} />);
    await screen.findByText("72.4");
    fireEvent.click(screen.getByRole("button", { name: "7 天" }));
    await waitFor(() =>
      expect(calls.at(-1)?.path).toBe("/body-metrics?days=7"),
    );
  });

  it("empty state text", async () => {
    current = EMPTY;
    render(<BodyMetrics onFatal={onFatal} />);
    expect(
      await screen.findByText(
        "還沒有紀錄。在聊天室輸入「體重 72.5」就能開始記錄。",
      ),
    ).toBeInTheDocument();
  });

  it("record today validates range and sends PUT with only filled fields", async () => {
    render(<BodyMetrics onFatal={onFatal} />);
    await screen.findByText("72.4");
    fireEvent.click(screen.getByRole("button", { name: "記錄今天的數據" }));
    const save = screen.getByRole("button", { name: "儲存" });
    expect(save).toBeDisabled();

    const weight = screen.getByLabelText("體重（kg）");
    expect(weight).toHaveAttribute("inputmode", "decimal");
    fireEvent.change(weight, { target: { value: "5" } });
    expect(screen.getByText("請輸入 30–300 之間的數字")).toBeInTheDocument();
    expect(save).toBeDisabled();

    fireEvent.change(weight, { target: { value: "71.84" } });
    expect(screen.queryByText("請輸入 30–300 之間的數字")).toBeNull();
    current = {
      ...DATA,
      points: [
        { date: "2026-10-19", weightKg: 71.8, bodyFatPct: null, waistCm: null },
      ],
    };
    fireEvent.click(save);

    await waitFor(() =>
      expect(calls.at(-1)).toEqual({
        method: "PUT",
        path: "/body-metrics/today",
        body: { weightKg: 71.8 },
      }),
    );
    expect(await screen.findByText("71.8")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "儲存" })).toBeNull();
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
  });

  it("tapping body fat card switches chart label", async () => {
    render(<BodyMetrics onFatal={onFatal} />);
    await screen.findByText("72.4");
    expect(screen.getByRole("img", { name: /^體重/ })).toBeInTheDocument();
    const tile = screen.getByRole("button", { name: /體脂/ });
    expect(tile).toHaveTextContent("−0.4");
    fireEvent.click(tile);
    expect(
      screen.getByRole("img", { name: /^體脂 30 天趨勢/ }),
    ).toBeInTheDocument();
    expect(tile).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "回到體重" }));
    expect(screen.getByRole("img", { name: /^體重/ })).toBeInTheDocument();
  });
});
