import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("shows loading", () => {
    render(<App state={{ kind: "loading" }} onClose={vi.fn()} />);
    expect(screen.getByText("載入中…")).toBeInTheDocument();
  });

  it("greets the user when ready", () => {
    render(
      <App state={{ kind: "ready", displayName: "小明" }} onClose={vi.fn()} />,
    );
    expect(
      screen.getByRole("heading", { name: "嗨，小明" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("帳號已連結完成。個人檔案設定會在下一個版本開放。"),
    ).toBeInTheDocument();
  });

  it("asks for consent and closes the window", () => {
    const onClose = vi.fn();
    render(<App state={{ kind: "consent_required" }} onClose={onClose} />);
    expect(
      screen.getByRole("heading", { name: "還差一步" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "回到聊天室" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows an error with a reload button", () => {
    render(<App state={{ kind: "error" }} onClose={vi.fn()} />);
    expect(
      screen.getByText("連線出了點問題，請稍後再試。"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新整理" }),
    ).toBeInTheDocument();
  });
});
