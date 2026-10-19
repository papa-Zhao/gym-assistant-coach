import { describe, expect, it } from "vitest";
import {
  addDays,
  isValidMetric,
  roundMetric,
  trailingAverage,
} from "./metrics";

describe("metrics", () => {
  it("roundMetric rounds to one decimal", () => {
    expect(roundMetric(72.45)).toBe(72.5);
    expect(roundMetric(72.44)).toBe(72.4);
  });

  it("isValidMetric boundaries", () => {
    expect(isValidMetric("weightKg", 30)).toBe(true);
    expect(isValidMetric("weightKg", 300)).toBe(true);
    expect(isValidMetric("weightKg", 29.9)).toBe(false);
    expect(isValidMetric("weightKg", 300.1)).toBe(false);
    expect(isValidMetric("weightKg", Number.NaN)).toBe(false);
    expect(isValidMetric("bodyFatPct", 3)).toBe(true);
    expect(isValidMetric("bodyFatPct", 2.9)).toBe(false);
  });

  it("addDays crosses month and year", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("trailingAverage uses calendar window", () => {
    const out = trailingAverage([
      { date: "2026-10-01", value: 70 },
      { date: "2026-10-05", value: 72 },
      { date: "2026-10-08", value: 74 },
    ]);
    expect(out).toEqual([
      { date: "2026-10-01", value: 70 },
      { date: "2026-10-05", value: 71 },
      { date: "2026-10-08", value: 73 },
    ]);
  });

  it("trailingAverage of single point is itself", () => {
    expect(trailingAverage([{ date: "2026-10-01", value: 70.3 }])).toEqual([
      { date: "2026-10-01", value: 70.3 },
    ]);
  });

  it("trailingAverage of empty is empty", () => {
    expect(trailingAverage([])).toEqual([]);
  });
});
