import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  const onDiscarded = vi.fn();
  const onFatal = vi.fn();
  const { unmount } = render(
    <ActiveWorkout
      session={initial}
      onSession={onSession}
      onFinished={onFinished}
      onDiscarded={onDiscarded}
      onFatal={onFatal}
    />,
  );
  return { calls, onSession, onFinished, onDiscarded, onFatal, unmount };
}

const NOW = Date.parse("2026-10-21T10:00:00.000Z");

function doneSet(secAgo: number, setIndex = 1) {
  return {
    setIndex,
    weightKg: 80,
    reps: 8,
    completedAt: new Date(NOW - secAgo * 1000).toISOString(),
  };
}

function setVibrate(fn: ((p: number) => boolean) | undefined) {
  Object.defineProperty(navigator, "vibrate", {
    value: fn,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
  setVibrate(undefined);
});

describe("ActiveWorkout", () => {
  it("exercise card shows a 64px illustration", () => {
    const { unmount } = setup(session([strengthItem()]));
    const svg = document.querySelector(".exercise-head svg.illus");
    expect(svg).toHaveAttribute("width", "64");
    unmount();
  });

  it("last sets and hint are shown; first-time exercise shows none", () => {
    setup(
      session([
        strengthItem({
          last: {
            date: "2026-10-13",
            sets: [
              {
                setIndex: 1,
                weightKg: 80,
                reps: 8,
                completedAt: "2026-10-19T04:00:00.000Z",
              },
              {
                setIndex: 2,
                weightKg: 80,
                reps: 8,
                completedAt: "2026-10-19T04:00:00.000Z",
              },
              {
                setIndex: 3,
                weightKg: 80,
                reps: 8,
                completedAt: "2026-10-19T04:00:00.000Z",
              },
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
      strengthItem({
        sets: [
          {
            setIndex: 1,
            weightKg: 82.5,
            reps: 8,
            completedAt: "2026-10-19T04:00:00.000Z",
          },
        ],
      }),
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
            {
              setIndex: 1,
              weightKg: 80,
              reps: 8,
              completedAt: "2026-10-19T04:00:00.000Z",
            },
            {
              setIndex: 2,
              weightKg: 77.5,
              reps: 7,
              completedAt: "2026-10-19T04:00:00.000Z",
            },
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

  it("discarding needs a confirm and then sends DELETE", async () => {
    const { calls, onDiscarded } = setup(session([]), () => undefined);
    fireEvent.click(screen.getByRole("button", { name: "放棄這次訓練" }));
    expect(
      screen.getByText("放棄後，這次的紀錄都會刪除。"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(calls).toEqual([]);
    expect(onDiscarded).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "放棄這次訓練" }));
    fireEvent.click(screen.getByRole("button", { name: "確定放棄" }));
    await waitFor(() => expect(onDiscarded).toHaveBeenCalled());
    expect(calls).toEqual([
      { method: "DELETE", path: "/workouts/s1", body: undefined },
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
        onDiscarded={vi.fn()}
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
            sets: [
              {
                setIndex: 1,
                weightKg: 60,
                reps: 8,
                completedAt: "2026-10-19T04:00:00.000Z",
              },
            ],
          },
        }),
      ]),
    );
    expect(screen.getByLabelText("第 1 組次數")).toHaveValue("10");
    expect(screen.getByLabelText("第 1 組重量")).toHaveValue("60");
  });

  it("elapsed label reads 訓練", () => {
    setup(session([]));
    expect(screen.getByText("訓練 00:00")).toBeInTheDocument();
  });

  it("RPE header has Chinese label and hint", () => {
    setup(session([strengthItem()]));
    expect(
      screen.getByRole("columnheader", { name: "RPE 自覺強度" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 很輕鬆 – 10 力竭")).toBeInTheDocument();
  });

  it("discard confirm buttons on one row", () => {
    setup(session([]));
    fireEvent.click(screen.getByRole("button", { name: "放棄這次訓練" }));
    const yes = screen.getByRole("button", { name: "確定放棄" });
    const no = screen.getByRole("button", { name: "取消" });
    expect(yes.parentElement).toBe(no.parentElement);
    expect(yes.parentElement).toHaveClass("confirm-actions");
  });

  it("remove exercise needs confirm and sends DELETE; buttons on one row", async () => {
    const after = session([]);
    const { calls, onSession } = setup(session([strengthItem()]), () => after);
    fireEvent.click(screen.getByRole("button", { name: /移除 槓鈴臥推/ }));
    expect(screen.getByText("移除這個動作和本次的紀錄？")).toBeInTheDocument();
    const yes = screen.getByRole("button", { name: "確定移除" });
    const no = screen.getByRole("button", { name: "取消" });
    expect(yes.parentElement).toBe(no.parentElement);
    expect(yes.parentElement).toHaveClass("confirm-actions");
    fireEvent.click(no);
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /移除 槓鈴臥推/ }));
    fireEvent.click(screen.getByRole("button", { name: "確定移除" }));
    await waitFor(() => expect(onSession).toHaveBeenCalledWith(after));
    expect(calls).toEqual([
      {
        method: "DELETE",
        path: "/workouts/s1/items/ex-bench",
        body: undefined,
      },
    ]);
  });

  it("adding an exercise scrolls to its card", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const updated = session([strengthItem()]);
    fakeApi(({ method }) => (method === "POST" ? updated : [BENCH]));
    function Harness() {
      const [s, setS] = useState(session([]));
      return (
        <ActiveWorkout
          session={s}
          onSession={setS}
          onFinished={vi.fn()}
          onDiscarded={vi.fn()}
          onFatal={vi.fn()}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "＋ 加動作" }));
    fireEvent.click(await screen.findByRole("button", { name: /槓鈴臥推/ }));
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(scroll.mock.contexts[0]).toHaveTextContent("槓鈴臥推");
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("rest countdown starts after completing a set and resumes from last completedAt", () => {
    vi.useFakeTimers({ now: NOW });
    const { unmount } = setup(session([strengthItem({ sets: [doneSet(30)] })]));
    // resumed mid-rest: 90 - 30 = 60 s left
    expect(screen.getByText("休息 1:00")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("休息 0:59")).toBeInTheDocument();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("no countdown without sets or when the last set is over an hour old", () => {
    vi.useFakeTimers({ now: NOW });
    const { unmount } = setup(session([strengthItem()]));
    expect(screen.queryByRole("group", { name: "休息計時" })).toBeNull();
    unmount();
    setup(session([strengthItem({ sets: [doneSet(3601)] })]));
    expect(screen.queryByRole("group", { name: "休息計時" })).toBeNull();
  });

  it("pinned bar comes before the header so content is not covered", () => {
    vi.useFakeTimers({ now: NOW });
    setup(session([strengthItem({ sets: [doneSet(10)] })]));
    const bar = document.querySelector(".rest-pinned")!;
    const head = document.querySelector(".workout-head")!;
    expect(
      bar.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("spacer height follows the pinned bar via ResizeObserver", () => {
    vi.useFakeTimers({ now: NOW });
    let callback: () => void = () => {};
    class FakeObserver {
      constructor(cb: () => void) {
        callback = cb;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", FakeObserver);
    try {
      setup(session([strengthItem({ sets: [doneSet(10)] })]));
      const bar = document.querySelector<HTMLElement>(".rest-pinned")!;
      Object.defineProperty(bar, "offsetHeight", {
        value: 72,
        configurable: true,
      });
      act(() => callback());
      expect(
        document.querySelector<HTMLElement>(".rest-spacer")!.style.height,
      ).toBe("72px");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("skip shrinks the timer to a compact banner", () => {
    vi.useFakeTimers({ now: NOW });
    const { unmount } = setup(session([strengthItem({ sets: [doneSet(10)] })]));
    fireEvent.click(screen.getByRole("button", { name: "跳過" }));
    expect(screen.getByRole("group", { name: "休息計時" })).toHaveClass(
      "compact",
    );
    expect(screen.queryByRole("button", { name: "跳過" })).toBeNull();
    unmount();
  });

  it("rest timer is rendered inside the pinned bar on the main view", () => {
    vi.useFakeTimers({ now: NOW });
    setup(session([strengthItem({ sets: [doneSet(10)] })]));
    expect(document.querySelector(".rest-pinned .rest-timer")).not.toBeNull();
    expect(document.querySelector(".rest-spacer")).not.toBeNull();
  });

  it("rest timer stays visible while picking and a skip survives the picker", async () => {
    vi.useFakeTimers({ now: NOW });
    setup(session([strengthItem({ sets: [doneSet(10)] })]), () => [BENCH]);
    fireEvent.click(screen.getByRole("button", { name: "＋ 加動作" }));
    expect(screen.getByText("休息 1:20")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "返回訓練" }));
    fireEvent.click(screen.getByRole("button", { name: "跳過" }));
    const compact = () => screen.getByRole("group", { name: "休息計時" });
    expect(compact()).toHaveClass("compact");
    fireEvent.click(screen.getByRole("button", { name: "＋ 加動作" }));
    expect(compact()).toHaveClass("compact");
    fireEvent.click(screen.getByRole("button", { name: "返回訓練" }));
    expect(compact()).toHaveClass("compact");
    await act(async () => {});
  });

  it("next set sends restSec; first set does not", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const { calls } = setup(
      session([
        strengthItem({ sets: [doneSet(100)] }),
        strengthItem({
          exercise: { ...BENCH, id: "ex-2", nameZh: "划船", nameEn: null },
        }),
      ]),
    );
    // another exercise's first set still follows an earlier set in the session
    fireEvent.click(screen.getByRole("button", { name: "＋ 加一組" }));
    fireEvent.click(screen.getAllByRole("button", { name: "完成這組" })[0]!);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ setIndex: 2, restSec: 100 });
  });

  it("first set of a workout omits restSec", async () => {
    const { calls } = setup(session([strengthItem()]));
    fireEvent.change(screen.getByLabelText("第 1 組重量"), {
      target: { value: "60" },
    });
    fireEvent.change(screen.getByLabelText("第 1 組次數"), {
      target: { value: "8" },
    });
    fireEvent.click(screen.getByRole("button", { name: "完成這組" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.body).not.toHaveProperty("restSec");
  });

  it("restSec is capped at 3600 and not sent when editing", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const { calls } = setup(session([strengthItem({ sets: [doneSet(5000)] })]));
    fireEvent.click(screen.getByRole("button", { name: "＋ 加一組" }));
    fireEvent.click(screen.getByRole("button", { name: "完成這組" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ restSec: 3600 });
    fireEvent.click(screen.getByRole("button", { name: "修改第 1 組" }));
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.body).not.toHaveProperty("restSec");
  });

  it("rest adjust persists; storage failure falls back to 90", () => {
    vi.useFakeTimers({ now: NOW });
    const { unmount } = setup(session([strengthItem({ sets: [doneSet(0)] })]));
    fireEvent.click(screen.getByRole("button", { name: "+15 秒" }));
    expect(screen.getByText("休息 1:45")).toBeInTheDocument();
    expect(window.localStorage.getItem("gac.restSec")).toBe("105");
    fireEvent.click(screen.getByRole("button", { name: "−15 秒" }));
    fireEvent.click(screen.getByRole("button", { name: "−15 秒" }));
    expect(window.localStorage.getItem("gac.restSec")).toBe("75");
    unmount();

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setup(session([strengthItem({ sets: [doneSet(0)] })]));
    expect(screen.getByText("休息 1:30")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+15 秒" }));
    expect(screen.getByText("休息 1:45")).toBeInTheDocument();
  });

  it("rest end vibrates with the pattern when supported", () => {
    vi.useFakeTimers({ now: NOW });
    const vibrate = vi.fn(() => true);
    setVibrate(vibrate);
    setup(session([strengthItem({ sets: [doneSet(88)] })]));
    expect(vibrate).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getAllByText("休息結束")[0]).toBeInTheDocument();
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith([300, 150, 300, 150, 300]);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText("已休息 1:33")).toBeInTheDocument();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("rest end does not fail when vibrate is unsupported", () => {
    vi.useFakeTimers({ now: NOW });
    setup(session([strengthItem({ sets: [doneSet(89)] })]));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getAllByText("休息結束")[0]).toBeInTheDocument();
  });
});
