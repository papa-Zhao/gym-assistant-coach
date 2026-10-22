import { describe, expect, it } from "vitest";
import {
  defaultMealType,
  isValidGrams,
  nutritionFor,
  scaleNutrition,
  sumNutrition,
} from "./meals";

describe("nutritionFor", () => {
  it("scales per-100g values to grams", () => {
    expect(
      nutritionFor({ kcal: 183, proteinG: 22.4, carbG: 0, fatG: 9.7 }, 150),
    ).toEqual({ kcal: 275, proteinG: 33.6, carbG: 0, fatG: 14.6 });
  });

  it("treats null macros as 0", () => {
    expect(
      nutritionFor({ kcal: 100, proteinG: null, carbG: null, fatG: null }, 50),
    ).toEqual({ kcal: 50, proteinG: 0, carbG: 0, fatG: 0 });
  });
});

describe("scaleNutrition", () => {
  it("scales proportionally to new grams", () => {
    expect(
      scaleNutrition({ kcal: 380, proteinG: 34, carbG: 2, fatG: 24 }, 180, 90),
    ).toEqual({ kcal: 190, proteinG: 17, carbG: 1, fatG: 12 });
  });

  it("throws when fromGrams is 0", () => {
    expect(() =>
      scaleNutrition({ kcal: 1, proteinG: 1, carbG: 1, fatG: 1 }, 0, 10),
    ).toThrow();
  });
});

describe("sumNutrition", () => {
  it("returns zeros for an empty list", () => {
    expect(sumNutrition([])).toEqual({
      kcal: 0,
      proteinG: 0,
      carbG: 0,
      fatG: 0,
    });
  });

  it("fixes float error to 1 decimal", () => {
    const r = sumNutrition([
      { kcal: 1, proteinG: 0.1, carbG: 0.1, fatG: 0.1 },
      { kcal: 2, proteinG: 0.2, carbG: 0.2, fatG: 0.2 },
    ]);
    expect(r).toEqual({ kcal: 3, proteinG: 0.3, carbG: 0.3, fatG: 0.3 });
  });
});

describe("defaultMealType", () => {
  it.each([
    [4, "breakfast"],
    [10, "breakfast"],
    [11, "lunch"],
    [14, "lunch"],
    [15, "snack"],
    [16, "snack"],
    [17, "dinner"],
    [21, "dinner"],
    [22, "snack"],
    [0, "snack"],
    [3, "snack"],
  ])("hour %i is %s", (hour, expected) => {
    expect(defaultMealType(hour)).toBe(expected);
  });
});

describe("isValidGrams", () => {
  it.each([1, 2000, 150.5, 1.2, 2.3])("%s is valid", (g) => {
    expect(isValidGrams(g)).toBe(true);
  });
  it.each([0, -1, 2000.1, 0.5, NaN, 150.55])("%s is invalid", (g) => {
    expect(isValidGrams(g)).toBe(false);
  });
});
