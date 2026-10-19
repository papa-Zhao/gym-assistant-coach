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

describe("Records", () => {
  const paths: string[] = [];

  beforeEach(() => {
    paths.length = 0;
    configureApi({
      apiUrl: "https://api.test",
      fetchImpl: (async (url: string) => {
        paths.push(url.replace("https://api.test", ""));
        return new Response(JSON.stringify(DATA));
      }) as unknown as typeof fetch,
      relogin: async () => ({ kind: "error" }),
    });
  });

  it("shows latest weight and links to body page", async () => {
    render(<Records onFatal={vi.fn()} />);
    expect(await screen.findByText("72.4")).toBeInTheDocument();
    expect(screen.getByText("30 天內 −1.2 kg")).toBeInTheDocument();
    expect(paths).toEqual(["/body-metrics?days=30"]);
    expect(screen.getByRole("link", { name: /身體數據/ })).toHaveAttribute(
      "href",
      "/records/body",
    );
  });

  it("diet and training are coming soon", async () => {
    render(<Records onFatal={vi.fn()} />);
    await screen.findByText("72.4");
    for (const name of ["飲食", "訓練"]) {
      const card = screen.getByRole("button", { name: new RegExp(name) });
      expect(card).toBeDisabled();
      expect(card).toHaveTextContent("即將推出");
    }
  });
});
