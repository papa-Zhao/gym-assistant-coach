import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWakeLock } from "./wakeLock";

const flush = () => new Promise((r) => setTimeout(r, 0));

let release: ReturnType<typeof vi.fn>;
let request: ReturnType<typeof vi.fn>;

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

beforeEach(() => {
  release = vi.fn().mockResolvedValue(undefined);
  request = vi.fn().mockResolvedValue({ release });
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: { request },
  });
  setVisibility("visible");
});

afterEach(() => {
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
});

describe("useWakeLock", () => {
  it("requests a screen lock while active", async () => {
    renderHook(() => useWakeLock(true));
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("screen");
  });

  it("does not request when inactive", async () => {
    renderHook(() => useWakeLock(false));
    await flush();
    expect(request).not.toHaveBeenCalled();
  });

  it("releases on unmount", async () => {
    const { unmount } = renderHook(() => useWakeLock(true));
    await flush();
    unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases when unmounted while the request is still pending", async () => {
    let resolve!: (s: { release: () => Promise<void> }) => void;
    request.mockReturnValue(new Promise((r) => (resolve = r)));
    const { unmount } = renderHook(() => useWakeLock(true));
    unmount();
    resolve({ release });
    await flush();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases when active turns false", async () => {
    const { rerender } = renderHook(({ a }) => useWakeLock(a), {
      initialProps: { a: true },
    });
    await flush();
    rerender({ a: false });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("re-requests when the page becomes visible", async () => {
    renderHook(() => useWakeLock(true));
    await flush();
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not re-request on visibilitychange when inactive", async () => {
    renderHook(() => useWakeLock(false));
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(request).not.toHaveBeenCalled();
  });

  it("no wakeLock API is a no-op", () => {
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });

  it("rejected request does not throw", async () => {
    request.mockRejectedValue(new Error("low power"));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    renderHook(() => useWakeLock(true));
    await flush();
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
