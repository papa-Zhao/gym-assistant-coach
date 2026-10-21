import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExercisePicker } from "./ExercisePicker";
import { BENCH, TREADMILL, fakeApi } from "./testHelpers";

function setup(handler: Parameters<typeof fakeApi>[0]) {
  const calls = fakeApi(handler);
  const onPick = vi.fn();
  render(
    <ExercisePicker onPick={onPick} onClose={vi.fn()} onFatal={vi.fn()} />,
  );
  return { calls, onPick };
}

describe("ExercisePicker", () => {
  it("each row shows a 40px illustration", async () => {
    setup(() => [BENCH, TREADMILL]);
    await screen.findByText("槓鈴臥推");
    const rows = within(screen.getByLabelText("動作列表")).getAllByRole(
      "button",
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const svg = row.querySelector("svg.illus");
      expect(svg).toHaveAttribute("width", "40");
      expect(svg).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("filters by kind, muscle and equipment category; English search; adds exercise", async () => {
    const { calls, onPick } = setup(() => [BENCH]);
    expect(await screen.findByText("槓鈴臥推")).toBeInTheDocument();
    expect(screen.getByText("Barbell Bench Press")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("動作列表")).getByText("自由重量"),
    ).toBeInTheDocument();
    expect(calls.at(-1)?.path).toBe("/exercises?kind=strength");

    fireEvent.click(screen.getByRole("button", { name: "胸" }));
    await waitFor(() =>
      expect(calls.at(-1)?.path).toBe("/exercises?kind=strength&muscle=chest"),
    );
    fireEvent.click(screen.getByRole("button", { name: "自由重量" }));
    await waitFor(() =>
      expect(calls.at(-1)?.path).toBe(
        "/exercises?kind=strength&muscle=chest&category=free_weight",
      ),
    );

    fireEvent.change(screen.getByLabelText("搜尋動作"), {
      target: { value: "bench" },
    });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() =>
      expect(calls.at(-1)?.path).toBe(
        "/exercises?kind=strength&q=bench&muscle=chest&category=free_weight",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "有氧" }));
    await waitFor(() =>
      expect(calls.at(-1)?.path).toBe("/exercises?kind=cardio&q=bench"),
    );
    expect(
      screen.queryByRole("button", { name: "胸" }),
    ).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /槓鈴臥推/ }));
    expect(onPick).toHaveBeenCalledWith(BENCH);
  });

  it("custom exercise form creates a cardio exercise and picks it", async () => {
    const created = { ...TREADMILL, id: "ex-custom", isCustom: true };
    const { calls, onPick } = setup(({ method }) =>
      method === "POST" ? created : [],
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "新增自訂動作" }),
    );
    const submit = screen.getByRole("button", { name: "新增並加入訓練" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("中文名稱"), {
      target: { value: "戶外跑" },
    });
    fireEvent.click(screen.getByRole("button", { name: "有氧" }));
    expect(screen.queryByLabelText("肌群")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("器材"), {
      target: { value: "none" },
    });
    fireEvent.click(submit);
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(created));
    expect(calls.at(-1)).toEqual({
      method: "POST",
      path: "/exercises",
      body: { nameZh: "戶外跑", kind: "cardio", equipment: "none" },
    });
  });

  it("custom strength exercise needs a muscle group", async () => {
    setup(() => []);
    fireEvent.click(
      await screen.findByRole("button", { name: "新增自訂動作" }),
    );
    fireEvent.change(screen.getByLabelText("中文名稱"), {
      target: { value: "X" },
    });
    fireEvent.change(screen.getByLabelText("器材"), {
      target: { value: "barbell" },
    });
    expect(
      screen.getByRole("button", { name: "新增並加入訓練" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("肌群"), {
      target: { value: "back" },
    });
    expect(
      screen.getByRole("button", { name: "新增並加入訓練" }),
    ).toBeEnabled();
  });
});
