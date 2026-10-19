import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FinishSummary } from "./FinishSummary";
import { SUMMARY, fakeApi } from "./testHelpers";

describe("FinishSummary", () => {
  it("finish shows 已傳到聊天室 only when notified", () => {
    const { unmount } = render(
      <FinishSummary summary={SUMMARY} onClose={vi.fn()} onFatal={vi.fn()} />,
    );
    expect(screen.getByText("已傳到聊天室")).toBeInTheDocument();
    expect(screen.getByText(/2 個動作・6 組/)).toBeInTheDocument();
    unmount();
    render(
      <FinishSummary
        summary={{ ...SUMMARY, notified: false }}
        onClose={vi.fn()}
        onFatal={vi.fn()}
      />,
    );
    expect(screen.queryByText("已傳到聊天室")).not.toBeInTheDocument();
    expect(screen.getByText("1920")).toBeInTheDocument();
  });

  it("lists PRs and closes the window", () => {
    const onClose = vi.fn();
    render(
      <FinishSummary summary={SUMMARY} onClose={onClose} onFatal={vi.fn()} />,
    );
    expect(
      screen.getByText(/80 kg × 8（估算 1RM 101.3 kg）/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "回到聊天室" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("save as template", async () => {
    const calls = fakeApi(() => ({ id: "t1", name: "推日", items: [] }));
    render(
      <FinishSummary summary={SUMMARY} onClose={vi.fn()} onFatal={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "存成範本" }));
    expect(screen.getByText("請輸入範本名稱")).toBeInTheDocument();
    expect(calls).toEqual([]);
    fireEvent.change(screen.getByLabelText("範本名稱"), {
      target: { value: " 推日 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "存成範本" }));
    await waitFor(() =>
      expect(screen.getByText("已存成範本")).toBeInTheDocument(),
    );
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/templates",
        body: { fromSessionId: "s1", name: "推日" },
      },
    ]);
  });
});
