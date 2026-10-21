import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Template, WeekStats } from "@gac/shared";
import { WorkoutHome } from "./WorkoutHome";
import { BENCH, SUMMARY, fakeApi, session, strengthItem } from "./testHelpers";

const WEEK: WeekStats = {
  from: "2026-10-19",
  to: "2026-10-25",
  sessions: 3,
  setsByMuscle: {
    chest: 9,
    back: 6,
    shoulders: 0,
    biceps: 0,
    triceps: 0,
    quads: 0,
    hamstrings: 0,
    glutes: 0,
    calves: 0,
    core: 0,
  },
  cardioMinutes: 40,
};
const TEMPLATES: Template[] = [
  {
    id: "t1",
    name: "推日",
    items: [{ exercise: BENCH, targetSets: 3, targetReps: 8 }],
  },
];

function render_(onClose = vi.fn()) {
  render(<WorkoutHome onFatal={vi.fn()} onClose={onClose} />);
}

describe("WorkoutHome", () => {
  it("home shows week stats and templates; blank start calls POST /workouts", async () => {
    const started = session([]);
    const calls = fakeApi(({ method, path }) => {
      if (path === "/workouts/active") return null;
      if (path === "/workouts/week") return WEEK;
      if (path === "/templates") return TEMPLATES;
      if (method === "POST" && path === "/workouts") return started;
    });
    render_();
    expect(
      await screen.findByRole("heading", { name: "記訓練" }),
    ).toBeInTheDocument();
    expect(screen.getByText("本週訓練 3 次")).toBeInTheDocument();
    expect(screen.getByText("胸")).toBeInTheDocument();
    expect(screen.getByText("9 組")).toBeInTheDocument();
    expect(screen.queryByText("肩")).not.toBeInTheDocument();
    expect(screen.getByText("有氧 40 分鐘")).toBeInTheDocument();
    expect(screen.getByText("推日")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "開始訓練" }));
    expect(await screen.findByText("訓練進行中")).toBeInTheDocument();
    expect(calls.at(-1)).toEqual({
      method: "POST",
      path: "/workouts",
      body: {},
    });
  });

  it("discarding the active workout returns to home", async () => {
    let active: unknown = session([]);
    const calls = fakeApi(({ method, path }) => {
      if (method === "DELETE" && path === "/workouts/s1") {
        active = null;
        return undefined;
      }
      if (path === "/workouts/active") return active;
      if (path === "/workouts/week") return WEEK;
      if (path === "/templates") return TEMPLATES;
    });
    render_();
    fireEvent.click(
      await screen.findByRole("button", { name: "放棄這次訓練" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "確定放棄" }));
    expect(
      await screen.findByRole("heading", { name: "記訓練" }),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  it("starting a template posts its id; deleting needs a confirm", async () => {
    const calls = fakeApi(({ method, path }) => {
      if (path === "/workouts/active") return null;
      if (path === "/workouts/week") return WEEK;
      if (path === "/templates" && method === "GET") return TEMPLATES;
      if (method === "DELETE") return undefined;
      return session([], { templateId: "t1", templateName: "推日" });
    });
    render_();
    fireEvent.click(await screen.findByRole("button", { name: "刪除 推日" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getByRole("button", { name: "刪除 推日" }));
    fireEvent.click(screen.getByRole("button", { name: "確定" }));
    await waitFor(() =>
      expect(screen.queryByText("推日")).not.toBeInTheDocument(),
    );
    expect(calls.at(-1)).toEqual({
      method: "DELETE",
      path: "/templates/t1",
      body: undefined,
    });
  });

  it("start template sends templateId", async () => {
    const calls = fakeApi(({ method, path }) => {
      if (path === "/workouts/active") return null;
      if (path === "/workouts/week") return WEEK;
      if (path === "/templates" && method === "GET") return TEMPLATES;
      return session([], { templateId: "t1", templateName: "推日" });
    });
    render_();
    fireEvent.click(await screen.findByRole("button", { name: "開始 推日" }));
    expect(
      await screen.findByRole("heading", { name: "推日" }),
    ).toBeInTheDocument();
    expect(calls.at(-1)?.body).toEqual({ templateId: "t1" });
  });

  it("resume active session on open", async () => {
    const calls = fakeApi(() => session([strengthItem()]));
    render_();
    expect(await screen.findByText("訓練進行中")).toBeInTheDocument();
    expect(screen.getByText("槓鈴臥推")).toBeInTheDocument();
    expect(calls.map((c) => c.path)).toEqual(["/workouts/active"]);
  });

  it("finish requires confirm and shows PRs", async () => {
    const onClose = vi.fn();
    const calls = fakeApi(({ method, path }) =>
      method === "POST" && path.endsWith("/finish")
        ? SUMMARY
        : session([strengthItem()]),
    );
    render_(onClose);
    fireEvent.click(await screen.findByRole("button", { name: "結束訓練" }));
    expect(calls.some((c) => c.path.endsWith("/finish"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "確定" }));
    expect(await screen.findByText("個人最佳紀錄")).toBeInTheDocument();
    expect(screen.getByText(/槓鈴臥推/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "回到聊天室" }));
    expect(onClose).toHaveBeenCalled();
  });
});
