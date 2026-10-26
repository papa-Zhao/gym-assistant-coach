import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Exercise,
  WorkoutHistoryEntry,
  WorkoutHistoryPage,
} from "@gac/shared";
import { AuthExpiredError, configureApi } from "../api";
import { WorkoutHistory } from "./WorkoutHistory";

const EX = (id: string, nameZh: string, kind: string) =>
  ({ id, nameZh, kind }) as unknown as Exercise;

const STRENGTH: WorkoutHistoryEntry = {
  id: "w1",
  date: "2026-10-05",
  endedAt: "2026-10-05T10:00:00.000Z",
  templateName: "推日",
  items: [
    {
      exercise: EX("e1", "臥推", "strength"),
      sets: [
        { setIndex: 1, weightKg: 60, reps: 8, completedAt: "x" },
        { setIndex: 2, weightKg: 60, reps: 8, restSec: 90, completedAt: "x" },
      ],
    },
  ],
};

const CARDIO: WorkoutHistoryEntry = {
  id: "w2",
  date: "2026-10-04",
  endedAt: "2026-10-04T10:00:00.000Z",
  templateName: null,
  items: [
    {
      exercise: EX("e2", "跑步機", "cardio"),
      cardio: [{ entryIndex: 1, durationMin: 20, distanceKm: 3 }],
    },
  ],
};

describe("WorkoutHistory", () => {
  const paths: string[] = [];
  let pages: (WorkoutHistoryPage | Error)[];

  beforeEach(() => {
    paths.length = 0;
    pages = [];
    configureApi({
      apiUrl: "https://api.test",
      fetchImpl: (async (url: string) => {
        paths.push(url.replace("https://api.test", ""));
        const next = pages.shift();
        if (next instanceof Error) throw next;
        return new Response(JSON.stringify(next));
      }) as unknown as typeof fetch,
      relogin: async () => ({ kind: "error" }),
    });
  });

  it("shows each set with rest", async () => {
    pages = [{ entries: [STRENGTH], nextBefore: null }];
    render(<WorkoutHistory onFatal={vi.fn()} />);
    expect(await screen.findByText("10/5・推日")).toBeInTheDocument();
    expect(screen.getByText("臥推")).toBeInTheDocument();
    expect(screen.getByText(/^第 1 組\s+60 kg × 8$/)).toBeInTheDocument();
    expect(screen.getByText(/60 kg × 8・休息 1:30/)).toBeInTheDocument();
  });

  it("cardio entry shows minutes", async () => {
    pages = [{ entries: [CARDIO], nextBefore: null }];
    render(<WorkoutHistory onFatal={vi.fn()} />);
    expect(await screen.findByText("10/4・訓練")).toBeInTheDocument();
    expect(screen.getByText("20 分鐘・3 km")).toBeInTheDocument();
  });

  it("load more fetches with before and appends", async () => {
    pages = [
      { entries: [STRENGTH], nextBefore: "2026-10-05T10:00:00.000Z" },
      { entries: [CARDIO], nextBefore: null },
    ];
    render(<WorkoutHistory onFatal={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "載入更多" }));
    expect(await screen.findByText("10/4・訓練")).toBeInTheDocument();
    expect(screen.getByText("10/5・推日")).toBeInTheDocument();
    expect(paths[1]).toContain("before=");
    expect(screen.queryByRole("button", { name: "載入更多" })).toBeNull();
  });

  it("load more failure shows inline error", async () => {
    pages = [
      { entries: [STRENGTH], nextBefore: "2026-10-05T10:00:00.000Z" },
      new Error("boom"),
    ];
    const onFatal = vi.fn();
    render(<WorkoutHistory onFatal={onFatal} />);
    fireEvent.click(await screen.findByRole("button", { name: "載入更多" }));
    expect(
      await screen.findByText("載入失敗，請再試一次。"),
    ).toBeInTheDocument();
    expect(onFatal).not.toHaveBeenCalled();
  });

  it("load more auth expiry calls onFatal", async () => {
    pages = [
      { entries: [STRENGTH], nextBefore: "2026-10-05T10:00:00.000Z" },
      new AuthExpiredError(),
    ];
    const onFatal = vi.fn();
    render(<WorkoutHistory onFatal={onFatal} />);
    fireEvent.click(await screen.findByRole("button", { name: "載入更多" }));
    await waitFor(() => expect(onFatal).toHaveBeenCalled());
    expect(screen.queryByText("載入失敗，請再試一次。")).toBeNull();
  });

  it("empty state", async () => {
    pages = [{ entries: [], nextBefore: null }];
    render(<WorkoutHistory onFatal={vi.fn()} />);
    expect(await screen.findByText("還沒有完成的訓練")).toBeInTheDocument();
  });

  it("auth failure calls onFatal", async () => {
    pages = [new AuthExpiredError()];
    const onFatal = vi.fn();
    render(<WorkoutHistory onFatal={onFatal} />);
    await waitFor(() => expect(onFatal).toHaveBeenCalled());
  });
});
