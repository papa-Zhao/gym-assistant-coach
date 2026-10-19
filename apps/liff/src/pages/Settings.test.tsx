import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Settings } from "./Settings";

describe("Settings", () => {
  it("links profile and targets to the profile page", () => {
    render(<Settings />);
    expect(screen.getByRole("link", { name: /個人檔案/ })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(screen.getByRole("link", { name: /每日目標/ })).toHaveAttribute(
      "href",
      "/profile",
    );
  });

  it("links the terms and privacy pages", () => {
    render(<Settings />);
    expect(screen.getByRole("link", { name: "服務條款" })).toHaveAttribute(
      "href",
      "/terms.html",
    );
    expect(screen.getByRole("link", { name: "隱私權政策" })).toHaveAttribute(
      "href",
      "/privacy.html",
    );
  });

  it("shows coming-soon items as disabled", () => {
    render(<Settings />);
    for (const name of ["匯出我的資料", "刪除我的所有資料", "訓練範本"]) {
      const item = screen.getByRole("button", { name: new RegExp(name) });
      expect(item).toBeDisabled();
      expect(item).toHaveTextContent("即將推出");
    }
  });
});
