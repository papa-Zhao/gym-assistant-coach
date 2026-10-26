import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RestTimer, formatRest } from "./RestTimer";
import { alertRestEnd } from "./restAlert";
import { getRestSound } from "./restSettings";

vi.mock("./restAlert", () => ({ alertRestEnd: vi.fn() }));

const NOW = Date.parse("2026-10-21T10:00:00.000Z");

afterEach(() => {
  vi.mocked(alertRestEnd).mockClear();
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

  it("countdown reaching zero calls alertRestEnd once", () => {
    vi.useFakeTimers({ now: NOW });
    window.localStorage.setItem("gac.restSec", "30");
    render(
      <RestTimer
        lastCompletedAt={NOW - 28_000}
        skippedFor={null}
        onSkip={vi.fn()}
      />,
    );
    expect(alertRestEnd).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(alertRestEnd).toHaveBeenCalledTimes(1);
    expect(alertRestEnd).toHaveBeenCalledWith({ sound: true });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(alertRestEnd).toHaveBeenCalledTimes(1);
  });

  it("does not alert when the end was missed while backgrounded", () => {
    vi.useFakeTimers({ now: NOW });
    window.localStorage.setItem("gac.restSec", "30");
    render(
      <RestTimer
        lastCompletedAt={NOW - 10_000}
        skippedFor={null}
        onSkip={vi.fn()}
      />,
    );
    act(() => {
      vi.setSystemTime(NOW + 60_000);
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(/已休息/)).toBeInTheDocument();
    expect(alertRestEnd).not.toHaveBeenCalled();
  });

  it("ended state adds the ended class for 3 seconds", () => {
    vi.useFakeTimers({ now: NOW });
    window.localStorage.setItem("gac.restSec", "30");
    render(
      <RestTimer
        lastCompletedAt={NOW - 28_000}
        skippedFor={null}
        onSkip={vi.fn()}
      />,
    );
    const box = screen.getByRole("group", { name: "休息計時" });
    expect(box).not.toHaveClass("ended");
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(box).toHaveClass("ended");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(box).not.toHaveClass("ended");
  });

  it("sound toggle flips and persists", () => {
    vi.useFakeTimers({ now: NOW });
    render(
      <RestTimer lastCompletedAt={NOW} skippedFor={null} onSkip={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "關閉提示音" }));
    const on = screen.getByRole("button", { name: "開啟提示音" });
    expect(on).toHaveTextContent("🔕");
    expect(on).toHaveAttribute("aria-pressed", "false");
    expect(getRestSound()).toBe(false);
  });
});
