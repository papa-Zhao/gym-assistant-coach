import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureApi } from "../api";
import { BodyMetrics } from "../pages/BodyMetrics";
import { Profile } from "../pages/Profile";
import { Records } from "../pages/Records";
import { ExercisePicker } from "../pages/workout/ExercisePicker";
import { WorkoutHome } from "../pages/workout/WorkoutHome";
import { Skeleton } from "./Skeleton";

const PAGES: [string, ReactElement][] = [
  [
    "個人檔案",
    <Profile today="2026-10-21" onClose={vi.fn()} onFatal={vi.fn()} />,
  ],
  ["我的紀錄", <Records onFatal={vi.fn()} />],
  ["身體數據", <BodyMetrics onFatal={vi.fn()} />],
  ["記訓練", <WorkoutHome onFatal={vi.fn()} onClose={vi.fn()} />],
  [
    "加動作",
    <ExercisePicker onPick={vi.fn()} onClose={vi.fn()} onFatal={vi.fn()} />,
  ],
];

describe("Skeleton", () => {
  beforeEach(() => {
    // Requests never settle, so every page stays in its loading state.
    configureApi({
      apiUrl: "https://api.test",
      fetchImpl: (() => new Promise(() => {})) as unknown as typeof fetch,
      relogin: async () => ({ kind: "error" }),
    });
  });

  it.each(PAGES)(
    "each page shows skeleton with status role while loading: %s",
    (_name, page) => {
      render(page);
      const statuses = screen.getAllByRole("status", { name: "載入中" });
      expect(statuses.length).toBeGreaterThan(0);
      for (const status of statuses) {
        expect(status.querySelector(".skeleton")).not.toBeNull();
        expect(status.firstElementChild).toHaveAttribute("aria-hidden", "true");
      }
      expect(screen.queryByText("載入中…")).not.toBeInTheDocument();
    },
  );

  it("hides the grey blocks from screen readers", () => {
    const { container } = render(<Skeleton layout="body" />);
    const blocks = container.querySelectorAll(".skeleton");
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks)
      expect(block.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
