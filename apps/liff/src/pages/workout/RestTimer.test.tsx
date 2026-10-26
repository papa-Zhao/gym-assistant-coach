import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
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
    const toggle = screen.getByRole("button", { name: "提示音" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    const on = screen.getByRole("button", { name: "提示音" });
    expect(on).toHaveTextContent("🔕");
    expect(on).toHaveAttribute("aria-pressed", "false");
    expect(getRestSound()).toBe(false);
  });

  it("skip shows compact elapsed banner", () => {
    vi.useFakeTimers({ now: NOW });
    const Harness = () => {
      const [skipped, setSkipped] = useState<number | null>(null);
      return (
        <RestTimer
          lastCompletedAt={NOW}
          skippedFor={skipped}
          onSkip={setSkipped}
        />
      );
    };
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "跳過" }));
    expect(screen.getByText("已休息 0:00")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "跳過" })).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector(".rest-timer.compact")).not.toBeNull();
  });

  it("a new completed set after skip restarts the countdown", () => {
    vi.useFakeTimers({ now: NOW });
    const { rerender } = render(
      <RestTimer lastCompletedAt={NOW} skippedFor={NOW} onSkip={vi.fn()} />,
    );
    expect(screen.getByText("已休息 0:00")).toBeInTheDocument();
    rerender(
      <RestTimer
        lastCompletedAt={NOW + 1000}
        skippedFor={NOW}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByText("休息 1:30")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "跳過" })).toBeInTheDocument();
  });

  it("hides after an hour", () => {
    vi.useFakeTimers({ now: NOW });
    const { container } = render(
      <RestTimer
        lastCompletedAt={NOW - 61 * 60 * 1000}
        skippedFor={null}
        onSkip={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("does not alert when skipped mid-rest", () => {
    vi.useFakeTimers({ now: NOW });
    window.localStorage.setItem("gac.restSec", "30");
    const { rerender } = render(
      <RestTimer lastCompletedAt={NOW} skippedFor={null} onSkip={vi.fn()} />,
    );
    rerender(
      <RestTimer lastCompletedAt={NOW} skippedFor={NOW} onSkip={vi.fn()} />,
    );
    act(() => {
      vi.advanceTimersByTime(31000);
    });
    expect(alertRestEnd).not.toHaveBeenCalled();
  });
});
