import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { configureApi } from "../../api";
import { ActiveWorkout } from "./ActiveWorkout";
import {
  BENCH,
  SUMMARY,
  TREADMILL,
  fakeApi,
  session,
  strengthItem,
} from "./testHelpers";

function setup(
  initial: ReturnType<typeof session>,
  handler: Parameters<typeof fakeApi>[0] = () => initial,
) {
  const calls = fakeApi(handler);
  const onSession = vi.fn();
  const onFinished = vi.fn();
  const onFatal = vi.fn();
  render(
    <ActiveWorkout
      session={initial}
      onSession={onSession}
      onFinished={onFinished}
      onFatal={onFatal}
    />,
  );
  return { calls, onSession, onFinished, onFatal };
}

describe("ActiveWorkout", () => {
  it("last sets and hint are shown; first-time exercise shows none", () => {
    setup(
      session([
        strengthItem({
          last: {
            date: "2026-10-13",
            sets: [
              { setIndex: 1, weightKg: 80, reps: 8 },
              { setIndex: 2, weightKg: 80, reps: 8 },
              { setIndex: 3, weightKg: 80, reps: 8 },
            ],
          },
          hint: { suggestWeightKg: 82.5 },
          targetReps: 8,
        }),
        strengthItem({
          exercise: {
            ...BENCH,
            id: "ex-new",
            nameZh: "啞鈴彎舉",
            nameEn: null,
          },
        }),
      ]),
    );
    expect(
      screen.getByText("上次（10/13）：80 kg × 8、8、8"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("上次每組都做到了，今天試試 82.5 kg？"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/上次（/)).toHaveLength(1);
    expect(screen.getAllByText(/今天試試/)).toHaveLength(1);
    // prefill falls back to the hint weight and target reps
    expect(screen.getAllByLabelText("第 1 組重量")[0]).toHaveValue("82.5");
    expect(screen.getAllByLabelText("第 1 組次數")[0]).toHaveValue("8");
  });

  it("complete set sends PUT with prefilled values", async () => {
    const updated = session([
      strengthItem({ sets: [{ setIndex: 1, weightKg: 82.5, reps: 8 }] }),
    ]);
    const { calls, onSession } = setup(
      session([
        strengthItem({
          hint: { suggestWeightKg: 82.5 },
          targetReps: 8,
        }),
      ]),
      () => updated,
    );
    fireEvent.click(screen.getByRole("button", { name: "完成這組" }));
    await waitFor(() => expect(onSession).toHaveBeenCalledWith(updated));
    expect(calls).toEqual([
      {
        method: "PUT",
        path: "/workouts/s1/sets",
        body: { exerciseId: "ex-bench", setIndex: 1, weightKg: 82.5, reps: 8 },
      },
    ]);
  });

  it("new set is prefilled from the last completed set in this session", () => {
    setup(
      session([
        strengthItem({
          sets: [
            { setIndex: 1, weightKg: 80, reps: 8 },
            { setIndex: 2, weightKg: 77.5, reps: 7 },
          ],
        }),
      ]),
    );
    expect(screen.getByText("1 ✓")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "＋ 加一組" }));
    expect(screen.getByLabelText("第 3 組重量")).toHaveValue("77.5");
    expect(screen.getByLabelText("第 3 組次數")).toHaveValue("7");
  });

  it("invalid reps shows field error", () => {
    const { calls } = setup(session([strengthItem()]));
    fireEvent.change(screen.getByLabelText("第 1 組重量"), {
      target: { value: "60" },
    });
    fireEvent.change(screen.getByLabelText("第 1 組次數"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "完成這組" }));
    expect(screen.getByText("請輸入 1–100 的整數")).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("cardio card records duration and optional fields", async () => {
    const { calls } = setup(
      session([
        { ...strengthItem({ exercise: TREADMILL }), cardio: [] } as never,
      ]),
    );
    fireEvent.click(screen.getByRole("button", { name: "完成這筆" }));
    expect(screen.getByText("請輸入 1–600 的整數")).toBeInTheDocument();
    expect(calls).toEqual([]);
    fireEvent.change(screen.getByLabelText(/時間/), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByLabelText(/速度/), {
      target: { value: "9.5" },
    });
    fireEvent.change(screen.getByLabelText(/坡度/), {
      target: { value: "41" },
    });
    fireEvent.click(screen.getByRole("button", { name: "完成這筆" }));
    expect(
      screen.getByText("請輸入 0–40 的數字（最多一位小數）"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/坡度/), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "完成這筆" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      method: "PUT",
      path: "/workouts/s1/cardio",
      body: {
        exerciseId: "ex-tread",
        entryIndex: 1,
        durationMin: 30,
        inclinePct: 2,
        speedKmh: 9.5,
      },
    });
  });

  it("finishing needs a confirm and then posts finish", async () => {
    const { calls, onFinished } = setup(
      session([strengthItem()]),
      () => SUMMARY,
    );
    fireEvent.click(screen.getByRole("button", { name: "結束訓練" }));
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "結束訓練" }));
    fireEvent.click(screen.getByRole("button", { name: "確定" }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(SUMMARY));
    expect(calls).toEqual([
      { method: "POST", path: "/workouts/s1/finish", body: undefined },
    ]);
  });

  it("finish with no content explains why", async () => {
    setup(session([strengthItem()]), () => new Response("{}", { status: 409 }));
    fireEvent.click(screen.getByRole("button", { name: "結束訓練" }));
    fireEvent.click(screen.getByRole("button", { name: "確定" }));
    expect(
      await screen.findByText("還沒有任何紀錄，先完成一組再結束訓練"),
    ).toBeInTheDocument();
  });

  it("adding an exercise posts it and returns to the workout", async () => {
    const updated = session([strengthItem()]);
    const { calls, onSession } = setup(session([]), ({ method }) =>
      method === "POST" ? updated : [BENCH],
    );
    fireEvent.click(screen.getByRole("button", { name: "＋ 加動作" }));
    fireEvent.click(await screen.findByRole("button", { name: /槓鈴臥推/ }));
    await waitFor(() => expect(onSession).toHaveBeenCalledWith(updated));
    expect(calls.at(-1)).toEqual({
      method: "POST",
      path: "/workouts/s1/items",
      body: { exerciseId: "ex-bench" },
    });
  });

  it("failed add shows error in picker", async () => {
    setup(session([]), ({ method }) =>
      method === "POST" ? new Response("{}", { status: 500 }) : [BENCH],
    );
    fireEvent.click(screen.getByRole("button", { name: "＋ 加動作" }));
    fireEvent.click(await screen.findByRole("button", { name: /槓鈴臥推/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("儲存失敗");
  });

  it("rows are disabled while adding", async () => {
    const posts: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    configureApi({
      apiUrl: "https://api.test",
      fetchImpl: (async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          posts.push(String(init.body));
          await gate;
          return new Response(JSON.stringify(session([strengthItem()])));
        }
        return new Response(JSON.stringify([BENCH]));
      }) as unknown as typeof fetch,
      relogin: async () => ({ kind: "error" }),
    });
    render(
      <ActiveWorkout
        session={session([])}
        onSession={vi.fn()}
        onFinished={vi.fn()}
        onFatal={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "＋ 加動作" }));
    const row = await screen.findByRole("button", { name: /槓鈴臥推/ });
    fireEvent.click(row);
    await waitFor(() => expect(row).toBeDisabled());
    fireEvent.click(row);
    release();
    await waitFor(() => expect(posts).toHaveLength(1));
  });

  it("template target reps prefill without hint", () => {
    setup(
      session([
        strengthItem({
          targetReps: 10,
          last: {
            date: "2026-10-13",
            sets: [{ setIndex: 1, weightKg: 60, reps: 8 }],
          },
        }),
      ]),
    );
    expect(screen.getByLabelText("第 1 組次數")).toHaveValue("10");
    expect(screen.getByLabelText("第 1 組重量")).toHaveValue("60");
  });
});
