import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RestTimer, formatRest } from "./RestTimer";

const NOW = Date.parse("2026-10-21T10:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("RestTimer", () => {
  it("formats m:ss", () => {
    expect(formatRest(90)).toBe("1:30");
    expect(formatRest(5)).toBe("0:05");
  });

  it("clamps the target to 30–300 seconds", () => {
    vi.useFakeTimers({ now: NOW });
    window.localStorage.setItem("gac.restSec", "30");
    render(
      <RestTimer lastCompletedAt={NOW} skippedFor={null} onSkip={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "−15 秒" })).toBeDisabled();
    expect(screen.getByText("休息 0:30")).toBeInTheDocument();
  });

  it("clears its interval on unmount", () => {
    vi.useFakeTimers({ now: NOW });
    const { unmount } = render(
      <RestTimer lastCompletedAt={NOW} skippedFor={null} onSkip={vi.fn()} />,
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("休息 1:28")).toBeInTheDocument();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the target raised past 300 disabled", () => {
    vi.useFakeTimers({ now: NOW });
    window.localStorage.setItem("gac.restSec", "300");
    render(
      <RestTimer lastCompletedAt={NOW} skippedFor={null} onSkip={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "+15 秒" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "−15 秒" }));
    expect(screen.getByText("休息 4:45")).toBeInTheDocument();
  });

  it("only the end of the rest is announced, not each tick", () => {
    vi.useFakeTimers({ now: NOW });
    window.localStorage.setItem("gac.restSec", "30");
    render(
      <RestTimer
        lastCompletedAt={NOW - 28_000}
        skippedFor={null}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByText("休息 0:02")).not.toHaveAttribute("role");
    const live = screen.getByRole("status");
    expect(live).toHaveTextContent("");
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("休息結束");
  });
});
