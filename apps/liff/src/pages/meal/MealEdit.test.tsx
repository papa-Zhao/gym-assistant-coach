import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeApi, type Call } from "../workout/testHelpers";
import { MealEdit } from "./MealEdit";
import { RICE, meal } from "./testData";

const today = "2026-10-22";

function search(text: string) {
  fireEvent.change(screen.getByLabelText("新增或換成其他食物"), {
    target: { value: text },
  });
}

describe("MealEdit", () => {
  it("adds a food at 100 g and posts the new meal", async () => {
    const calls = fakeApi((c: Call) =>
      c.path.startsWith("/foods") ? { foods: [RICE] } : meal(),
    );
    const onDone = vi.fn();
    render(
      <MealEdit type="lunch" today={today} onFatal={vi.fn()} onDone={onDone} />,
    );
    expect(screen.getByRole("heading", { name: "記錄一餐" })).toBeVisible();
    search("白飯");
    fireEvent.click(await screen.findByRole("button", { name: /每 100 g/ }));
    expect(screen.getByText(/合計/)).toHaveTextContent("合計 130 kcal");
    fireEvent.click(screen.getByRole("button", { name: "儲存並確認" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const post = calls.find((c) => c.method === "POST");
    expect(post?.path).toBe("/meals");
    expect(post?.body).toEqual({
      eatenOn: today,
      mealType: "lunch",
      items: [{ foodId: "f-rice", grams: 100 }],
    });
  });

  it("edits grams and sends the item by id", async () => {
    const calls = fakeApi(() => meal());
    const onDone = vi.fn();
    render(
      <MealEdit id="m1" today={today} onFatal={vi.fn()} onDone={onDone} />,
    );
    const input = await screen.findByLabelText("白飯 克數");
    fireEvent.change(input, { target: { value: "90" } });
    expect(screen.getByText(/合計/)).toHaveTextContent("合計 117 kcal");
    fireEvent.click(screen.getByRole("button", { name: "儲存並確認" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.path).toBe("/meals/m1");
    expect(put?.body).toEqual({
      mealType: "lunch",
      items: [{ id: "i1", grams: 90 }],
    });
  });

  it("steps grams by 10 within limits", async () => {
    fakeApi(() => meal());
    render(<MealEdit id="m1" today={today} onFatal={vi.fn()} />);
    const input = await screen.findByLabelText("白飯 克數");
    fireEvent.click(screen.getByRole("button", { name: /增加 10 克/ }));
    expect(input).toHaveValue("190");
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /減少 10 克/ }));
    expect(input).toHaveValue("1");
  });

  it.each(["0", "2001"])("disables save for %s g", async (value) => {
    fakeApi(() => meal());
    render(<MealEdit id="m1" today={today} onFatal={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText("白飯 克數"), {
      target: { value },
    });
    expect(screen.getByText("克數要在 1–2000 之間")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "儲存並確認" })).toBeDisabled();
  });

  it("explains the one-decimal rule for in-range values", async () => {
    fakeApi(() => meal());
    render(<MealEdit id="m1" today={today} onFatal={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText("白飯 克數"), {
      target: { value: "150.55" },
    });
    expect(screen.getByText("克數最多小數 1 位")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "儲存並確認" })).toBeDisabled();
  });

  it("deletes the meal only after an in-page confirmation", async () => {
    const calls = fakeApi((c) => (c.method === "DELETE" ? undefined : meal()));
    const onDone = vi.fn();
    render(
      <MealEdit id="m1" today={today} onFatal={vi.fn()} onDone={onDone} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "刪除這一餐" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "確定刪除" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls.find((c) => c.method === "DELETE")?.path).toBe("/meals/m1");
  });

  it("shows not-found with a link back on 404", async () => {
    fakeApi(() => new Response("{}", { status: 404 }));
    render(<MealEdit id="gone" today={today} onFatal={vi.fn()} />);
    expect(await screen.findByText("找不到這一餐")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "回到我的紀錄" })).toHaveAttribute(
      "href",
      "/records",
    );
  });
});
