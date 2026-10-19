import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

const base = { onClose: vi.fn(), today: "2026-10-19" };

describe("App", () => {
  it("shows loading", () => {
    render(<App {...base} state={{ kind: "loading" }} pathname="/profile" />);
    expect(screen.getByText("載入中…")).toBeInTheDocument();
  });

  it("renders the page for the path when ready", () => {
    render(
      <App
        {...base}
        state={{ kind: "ready", displayName: "小明" }}
        pathname="/records"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "我的紀錄" }),
    ).toBeInTheDocument();
  });

  it("renders the workout and settings pages", () => {
    const { unmount } = render(
      <App
        {...base}
        state={{ kind: "ready", displayName: "小明" }}
        pathname="/workout"
      />,
    );
    expect(screen.getByRole("heading", { name: "記訓練" })).toBeInTheDocument();
    unmount();
    render(
      <App
        {...base}
        state={{ kind: "ready", displayName: "小明" }}
        pathname="/settings"
      />,
    );
    expect(screen.getByRole("heading", { name: "設定" })).toBeInTheDocument();
  });

  it("asks for consent and closes the window", () => {
    const onClose = vi.fn();
    render(
      <App
        {...base}
        onClose={onClose}
        state={{ kind: "consent_required" }}
        pathname="/profile"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "還差一步" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "回到聊天室" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows an error with a reload button", () => {
    render(<App {...base} state={{ kind: "error" }} pathname="/profile" />);
    expect(
      screen.getByText("連線出了點問題，請稍後再試。"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新整理" }),
    ).toBeInTheDocument();
  });
});
