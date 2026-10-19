import { describe, expect, it } from "vitest";
import {
  calcTargets,
  TARGET_LIMITS,
  floorKcal,
  isBelowFloor,
  taipeiDate,
  validateProfile,
  type ProfileInput,
} from "./targets";

const TODAY = "2026-10-19";

const maleModerate: ProfileInput = {
  sex: "male",
  birthYear: 1994,
  heightCm: 175,
  weightKg: 72.4,
  activityLevel: "moderate",
  goal: "maintain",
};

describe("calcTargets", () => {
  it("male moderate maintain", () => {
    const r = calcTargets(maleModerate, TODAY);
    expect(r.bmr).toBeCloseTo(1662.75, 5);
    expect(r.targets).toEqual({
      kcal: 2580,
      proteinG: 116,
      fatG: 72,
      carbG: 367,
    });
    expect(r.clampedToFloor).toBe(false);
  });

  it("bulk adds 250 and uses 1.8 g/kg", () => {
    const r = calcTargets({ ...maleModerate, goal: "bulk" }, TODAY);
    expect(r.targets.kcal).toBe(Math.round((1662.75 * 1.55 + 250) / 10) * 10);
    expect(r.targets.proteinG).toBe(Math.round(72.4 * 1.8));
  });

  it("female sedentary cut is clamped to floor", () => {
    const r = calcTargets(
      {
        sex: "female",
        birthYear: 1990,
        heightCm: 150,
        weightKg: 45,
        activityLevel: "sedentary",
        goal: "cut",
      },
      TODAY,
    );
    expect(r.targets.kcal).toBe(r.floorKcal);
    expect(r.floorKcal).toBe(1200);
    expect(r.clampedToFloor).toBe(true);
  });
});

describe("floorKcal", () => {
  it("is max of BMR and sex minimum, rounded up to 10", () => {
    expect(floorKcal("female", 1046.5)).toBe(1200);
    expect(floorKcal("male", 1200)).toBe(1500);
    expect(floorKcal("male", 1662.75)).toBe(1670);
    expect(floorKcal("female", 1500)).toBe(1500);
  });
});

describe("validateProfile", () => {
  it("age boundary", () => {
    expect(
      validateProfile({ ...maleModerate, birthYear: 2008 }, TODAY),
    ).toEqual([]);
    expect(
      validateProfile({ ...maleModerate, birthYear: 2009 }, TODAY),
    ).toEqual(["birthYear"]);
    expect(
      validateProfile({ ...maleModerate, birthYear: 1925 }, TODAY),
    ).toEqual(["birthYear"]);
    expect(
      validateProfile({ ...maleModerate, birthYear: 1926 }, TODAY),
    ).toEqual([]);
  });

  it("flags height, weight and enums", () => {
    const bad = {
      ...maleModerate,
      heightCm: 99,
      weightKg: 301,
      sex: "x",
      activityLevel: "y",
      goal: "z",
    } as unknown as ProfileInput;
    expect(validateProfile(bad, TODAY).sort()).toEqual(
      ["activityLevel", "goal", "heightCm", "sex", "weightKg"].sort(),
    );
    expect(
      validateProfile({ ...maleModerate, heightCm: 250, weightKg: 30 }, TODAY),
    ).toEqual([]);
  });
});

describe("taipeiDate", () => {
  it("rolls over at 16:00 UTC", () => {
    expect(taipeiDate(new Date("2026-10-18T15:59:59Z"))).toBe("2026-10-18");
    expect(taipeiDate(new Date("2026-10-18T16:00:00Z"))).toBe("2026-10-19");
  });
});

describe("isBelowFloor", () => {
  it("true for override under floor", () => {
    expect(isBelowFloor(maleModerate, 1400, TODAY)).toBe(true);
    expect(isBelowFloor(maleModerate, 2580, TODAY)).toBe(false);
  });
});

describe("TARGET_LIMITS", () => {
  it("exposes the integer ranges for kcal and grams", () => {
    expect(TARGET_LIMITS).toEqual({
      kcal: { min: 800, max: 10000 },
      gram: { min: 0, max: 2000 },
    });
  });
});
