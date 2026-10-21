import { afterEach, describe, expect, it, vi } from "vitest";
import { getRestSec, setRestSec } from "./restSettings";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("restSettings", () => {
  it("defaults to 90 and round-trips a saved value", () => {
    expect(getRestSec()).toBe(90);
    setRestSec(120);
    expect(window.localStorage.getItem("gac.restSec")).toBe("120");
    expect(getRestSec()).toBe(120);
  });

  it("clamps to 30–300 and ignores garbage", () => {
    setRestSec(10);
    expect(getRestSec()).toBe(30);
    setRestSec(999);
    expect(getRestSec()).toBe(300);
    window.localStorage.setItem("gac.restSec", "abc");
    expect(getRestSec()).toBe(90);
  });

  it("falls back to 90 when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getRestSec()).toBe(90);
    expect(() => setRestSec(120)).not.toThrow();
  });
});
