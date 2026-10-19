import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Placeholder } from "./Placeholder";

describe("Placeholder", () => {
  it("shows the title, coming-soon copy and a close button", () => {
    const onClose = vi.fn();
    render(<Placeholder title="我的紀錄" onClose={onClose} />);
    expect(
      screen.getByRole("heading", { name: "我的紀錄" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("這個功能即將推出，敬請期待。"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "回到聊天室" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
