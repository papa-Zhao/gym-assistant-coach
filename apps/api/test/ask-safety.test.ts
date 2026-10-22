import { describe, expect, it } from "vitest";
import { lowKcalWarning, needsMedicalNotice } from "../src/ask/safety";

describe("needsMedicalNotice", () => {
  it("matches keywords in any text", () => {
    expect(needsMedicalNotice("我膝蓋痛還能深蹲嗎")).toBe(true);
    expect(needsMedicalNotice("今天練什麼", "練腿")).toBe(false);
    expect(needsMedicalNotice("今天練什麼", "我懷孕了")).toBe(true);
  });
});

describe("lowKcalWarning", () => {
  const warn = "提醒：每天熱量建議不低於 1500 kcal。";
  it("warns on low daily intake", () => {
    expect(lowKcalWarning("建議每天吃 1000 kcal", 1500)).toBe(warn);
    expect(lowKcalWarning("一天 1,200 大卡就好", 1500)).toBe(warn);
  });
  it("handles other markers, bare 卡 and the floor boundary", () => {
    expect(lowKcalWarning("每日 1000 卡", 1500)).toBe(warn);
    expect(lowKcalWarning("一日 900 kcal", 1500)).toBe(warn);
    expect(lowKcalWarning("每天 1500 kcal", 1500)).toBeNull();
  });
  it("checks the lower bound of ranges and later numbers", () => {
    expect(lowKcalWarning("每天 1,000–1,200 kcal", 1500)).toBe(warn);
    expect(lowKcalWarning("每天 1000 到 1200 大卡", 1500)).toBe(warn);
    expect(lowKcalWarning("每天 3 餐，共 1000 kcal", 1500)).toBe(warn);
    expect(lowKcalWarning("每天 1500–1800 kcal", 1500)).toBeNull();
  });
  it("does not cross sentence breaks", () => {
    expect(
      lowKcalWarning("每天都要吃足蛋白質。午餐約 560 kcal", 1500),
    ).toBeNull();
    expect(lowKcalWarning("每天都吃\n560 kcal", 1500)).toBeNull();
  });
  it("ignores safe or unrelated numbers", () => {
    expect(lowKcalWarning("每天 1800 大卡", 1500)).toBeNull();
    expect(lowKcalWarning("晚餐約 560 kcal", 1500)).toBeNull();
    expect(lowKcalWarning("每天走 8000 步", 1500)).toBeNull();
  });
});
