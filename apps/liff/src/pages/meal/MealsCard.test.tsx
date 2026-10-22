import type { Meal } from "@gac/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeApi } from "../workout/testHelpers";
import { MealsCard, mealSummary } from "./MealsCard";
import { meal } from "./testData";

function api(targetKcal: number | null) {
  const m = meal();
  fakeApi((call) =>
    call.path === "/meals"
      ? { date: "2026-10-22", meals: [m], consumed: m.total }
      : { profile: null, targets: targetKcal ? { kcal: targetKcal } : null },
  );
}

describe("MealsCard", () => {
  it("lists the lunch row and add rows for missing meals", async () => {
    api(2000);
    render(<MealsCard onFatal={vi.fn()} />);
    const lunch = await screen.findByRole("link", { name: /午餐/ });
    expect(lunch).toHaveTextContent("白飯");
    expect(lunch).toHaveTextContent("234 kcal");
    expect(lunch).toHaveAttribute("href", "/meal?id=m1");
    expect(screen.getAllByText("＋ 記錄")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /早餐/ })).toHaveAttribute(
      "href",
      "/meal?type=breakfast",
    );
    expect(screen.getByRole("link", { name: /晚餐/ })).toHaveAttribute(
      "href",
      "/meal?type=dinner",
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "234",
    );
    expect(screen.getByText("／ 2000 kcal")).toBeInTheDocument();
  });

  it("marks a draft row with 草稿", async () => {
    const m = meal({ status: "draft" });
    fakeApi((call) =>
      call.path === "/meals"
        ? { date: "2026-10-22", meals: [m], consumed: m.total }
        : { profile: null, targets: null },
    );
    render(<MealsCard onFatal={vi.fn()} />);
    expect(await screen.findByRole("link", { name: /午餐/ })).toHaveTextContent(
      "234 kcal 草稿",
    );
  });

  it("orders rows breakfast, lunch, dinner with empty rows in place", async () => {
    api(2000);
    render(<MealsCard onFatal={vi.fn()} />);
    await screen.findByRole("link", { name: /午餐/ });
    const labels = screen
      .getAllByRole("link")
      .map((a) => a.querySelector(".meal-type")?.textContent);
    expect(labels).toEqual(["早餐", "午餐", "晚餐"]);
  });

  it("summarises 3+ items with 等", () => {
    const item = meal().items[0] as Meal["items"][number];
    const three = meal({
      items: [
        { ...item, name: "甲" },
        { ...item, name: "乙" },
        { ...item, name: "丙" },
      ],
    });
    expect(mealSummary(three)).toBe("甲＋乙等");
    expect(mealSummary(meal({ items: three.items.slice(0, 2) }))).toBe(
      "甲＋乙",
    );
  });

  it("shows only intake when there is no target", async () => {
    api(null);
    render(<MealsCard onFatal={vi.fn()} />);
    await screen.findByRole("link", { name: /午餐/ });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
