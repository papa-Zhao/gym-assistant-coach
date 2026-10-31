import { MUSCLE_GROUPS, type MuscleGroup } from "@gac/shared";
import { describe, expect, it } from "vitest";
import { buildWorkoutTips, type TipInput } from "../src/workouts/tips";

const allTrained = (): Record<MuscleGroup, number> =>
  Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, 3])) as Record<
    MuscleGroup,
    number
  >;

const input = (over: Partial<TipInput> = {}): TipInput => ({
  exercises: [],
  volumeKg: 0,
  previousVolumeKg: null,
  weekSetsByMuscle: allTrained(),
  taipeiWeekday: 1,
  ...over,
});

const bench = (
  reps: number[],
  weightKg = 60,
  targetReps: number | null = 8,
) => ({
  nameZh: "槓鈴臥推",
  sets: reps.map((r) => ({ weightKg, reps: r })),
  targetReps,
});

describe("buildWorkoutTips", () => {
  it("suggests overload for exercises that hit target", () => {
    const tips = buildWorkoutTips(input({ exercises: [bench([8, 8])] }));
    expect(tips).toContain("下次槓鈴臥推可以試試 62.5 kg");
  });

  it("no overload when a set missed the target", () => {
    const tips = buildWorkoutTips(input({ exercises: [bench([8, 6])] }));
    expect(tips.some((t) => t.includes("可以試試"))).toBe(false);
  });

  it("at most two overload tips", () => {
    const tips = buildWorkoutTips(
      input({
        exercises: [
          { ...bench([8]), nameZh: "A" },
          { ...bench([8]), nameZh: "B" },
          { ...bench([8]), nameZh: "C" },
        ],
      }),
    );
    expect(tips.filter((t) => t.includes("可以試試"))).toEqual([
      "下次A可以試試 62.5 kg",
      "下次B可以試試 62.5 kg",
    ]);
  });

  it("volume up 10%", () => {
    const tips = buildWorkoutTips(
      input({ volumeKg: 1100, previousVolumeKg: 1000 }),
    );
    expect(tips).toContain("總訓練量比上次多 10%");
  });

  it("volume down 20%", () => {
    const tips = buildWorkoutTips(
      input({ volumeKg: 800, previousVolumeKg: 1000 }),
    );
    expect(tips).toContain("總訓練量比上次少 20%，可能是累了，記得睡飽");
  });

  it("volume within 5% says nothing", () => {
    const tips = buildWorkoutTips(
      input({ volumeKg: 1030, previousVolumeKg: 1000 }),
    );
    expect(tips.some((t) => t.includes("總訓練量"))).toBe(false);
  });

  it("previousVolumeKg null or zero says nothing", () => {
    for (const previousVolumeKg of [null, 0]) {
      const tips = buildWorkoutTips(input({ volumeKg: 500, previousVolumeKg }));
      expect(tips.some((t) => t.includes("總訓練量"))).toBe(false);
    }
  });

  it("missing muscles listed from Thursday", () => {
    const week = {
      ...allTrained(),
      hamstrings: 0,
      glutes: 0,
      calves: 0,
      core: 0,
    };
    expect(
      buildWorkoutTips(input({ weekSetsByMuscle: week, taipeiWeekday: 4 })),
    ).toContain("本週還沒練到：腿後、臀、小腿");
    expect(
      buildWorkoutTips(input({ weekSetsByMuscle: week, taipeiWeekday: 0 })),
    ).toContain("本週還沒練到：腿後、臀、小腿");
    expect(
      buildWorkoutTips(
        input({ weekSetsByMuscle: week, taipeiWeekday: 3 }),
      ).some((t) => t.startsWith("本週還沒練到")),
    ).toBe(false);
  });

  it("never more than 3", () => {
    const tips = buildWorkoutTips(
      input({
        exercises: [
          { ...bench([8]), nameZh: "A" },
          { ...bench([8]), nameZh: "B" },
        ],
        volumeKg: 2000,
        previousVolumeKg: 1000,
        weekSetsByMuscle: { ...allTrained(), core: 0 },
        taipeiWeekday: 5,
      }),
    );
    expect(tips).toHaveLength(3);
    expect(tips[2]).toBe("總訓練量比上次多 100%");
  });

  it("fallback when nothing applies", () => {
    expect(buildWorkoutTips(input())).toEqual([
      "完成了！記得補充蛋白質和水分。",
    ]);
  });

  it("cardio-only session gets the fallback", () => {
    expect(
      buildWorkoutTips(input({ volumeKg: 0, previousVolumeKg: 0 })),
    ).toEqual(["完成了！記得補充蛋白質和水分。"]);
  });
});
