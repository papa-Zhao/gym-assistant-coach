import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeApi } from "../workout/testHelpers";
import { MealsCard } from "./MealsCard";
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

  it("shows only intake when there is no target", async () => {
    api(null);
    render(<MealsCard onFatal={vi.fn()} />);
    await screen.findByRole("link", { name: /午餐/ });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
