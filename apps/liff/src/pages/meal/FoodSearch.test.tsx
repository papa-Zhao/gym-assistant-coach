import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi } from "../workout/testHelpers";
import { FoodSearch } from "./FoodSearch";
import { RICE } from "./testData";

describe("FoodSearch", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits 300 ms, encodes the query, then lists results", async () => {
    const calls = fakeApi(() => ({ foods: [RICE] }));
    const onPick = vi.fn();
    render(<FoodSearch onPick={onPick} onFatal={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("新增或換成其他食物"), {
      target: { value: "白飯" },
    });
    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(calls).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(calls.map((c) => c.path)).toEqual(["/foods?q=%E7%99%BD%E9%A3%AF"]);
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.click(screen.getByRole("button", { name: /白飯/ }));
    expect(onPick).toHaveBeenCalledWith(RICE);
  });

  it("shows the data source line", () => {
    fakeApi(() => ({ foods: [] }));
    render(<FoodSearch onPick={vi.fn()} onFatal={vi.fn()} />);
    expect(
      screen.getByText("資料來源：衛生福利部食品藥物管理署 食品營養成分資料庫"),
    ).toBeInTheDocument();
  });
});
