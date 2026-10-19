import { describe, expect, it } from "vitest";
import {
  EQUIPMENT,
  EQUIPMENT_CATEGORIES,
  bestE1RM,
  equipmentCategory,
  estimate1RM,
  overloadHint,
  volume,
  weekRange,
} from "./workouts";

describe("workouts", () => {
  it("estimate1RM epley", () => {
    expect(estimate1RM(100, 5)).toBe(116.7);
  });

  it("estimate1RM excludes 13+ reps and zero weight", () => {
    expect(estimate1RM(100, 13)).toBeNull();
    expect(estimate1RM(0, 5)).toBeNull();
    expect(estimate1RM(100, 12)).toBe(140);
  });

  it("bestE1RM picks max", () => {
    expect(
      bestE1RM([
        { weightKg: 100, reps: 5 },
        { weightKg: 110, reps: 3 },
        { weightKg: 50, reps: 20 },
      ]),
    ).toBe(121);
    expect(bestE1RM([{ weightKg: 50, reps: 20 }])).toBeNull();
    expect(bestE1RM([])).toBeNull();
  });

  it("overloadHint all sets hit target suggests +2.5", () => {
    const last = [
      { weightKg: 80, reps: 8 },
      { weightKg: 80, reps: 8 },
      { weightKg: 80, reps: 8 },
    ];
    expect(overloadHint(last, 8)).toEqual({ suggestWeightKg: 82.5 });
  });

  it("overloadHint missed set gives null", () => {
    expect(
      overloadHint(
        [
          { weightKg: 80, reps: 8 },
          { weightKg: 80, reps: 7 },
        ],
        8,
      ),
    ).toBeNull();
  });

  it("overloadHint bodyweight history gives null", () => {
    expect(
      overloadHint(
        [
          { weightKg: 0, reps: 10 },
          { weightKg: 0, reps: 10 },
        ],
        10,
      ),
    ).toBeNull();
  });

  it("overloadHint blank workout uses first set reps as target", () => {
    expect(
      overloadHint(
        [
          { weightKg: 80, reps: 8 },
          { weightKg: 80, reps: 8 },
        ],
        null,
      ),
    ).toEqual({ suggestWeightKg: 82.5 });
    expect(
      overloadHint(
        [
          { weightKg: 80, reps: 8 },
          { weightKg: 80, reps: 9 },
        ],
        null,
      ),
    ).toEqual({ suggestWeightKg: 82.5 });
    expect(
      overloadHint(
        [
          { weightKg: 80, reps: 8 },
          { weightKg: 80, reps: 7 },
        ],
        null,
      ),
    ).toBeNull();
  });

  it("overloadHint empty last gives null", () => {
    expect(overloadHint([], 8)).toBeNull();
    expect(overloadHint([], null)).toBeNull();
  });

  it("overloadHint uses the heaviest last weight", () => {
    expect(
      overloadHint(
        [
          { weightKg: 60, reps: 10 },
          { weightKg: 80, reps: 10 },
        ],
        10,
      ),
    ).toEqual({ suggestWeightKg: 82.5 });
  });

  it("equipmentCategory maps every equipment", () => {
    for (const e of EQUIPMENT) {
      expect(EQUIPMENT_CATEGORIES).toContain(equipmentCategory(e));
    }
    expect(equipmentCategory("smith_machine")).toBe("semi_machine");
    expect(equipmentCategory("kettlebell")).toBe("free_weight");
    expect(equipmentCategory("treadmill")).toBe("cardio_equipment");
  });

  it("weekRange monday to sunday", () => {
    const week = { from: "2026-10-19", to: "2026-10-25" };
    expect(weekRange("2026-10-20")).toEqual(week);
    expect(weekRange("2026-10-25")).toEqual(week);
    expect(weekRange("2026-10-19")).toEqual(week);
    expect(weekRange("2026-10-26")).toEqual({
      from: "2026-10-26",
      to: "2026-11-01",
    });
  });

  it("volume sums weight times reps", () => {
    expect(
      volume([
        { weightKg: 80, reps: 8 },
        { weightKg: 60, reps: 10 },
      ]),
    ).toBe(1240);
    expect(volume([])).toBe(0);
  });
});
