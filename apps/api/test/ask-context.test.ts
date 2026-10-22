import type { Nutrition, WeekStats } from "@gac/shared";
import { MUSCLE_GROUPS } from "@gac/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAskContext,
  loadAskContext,
  todayLine,
  type AskContextData,
} from "../src/ask/context";
import { foods } from "../src/db/schema";
import { createMeal } from "../src/meals/repo";
import { saveProfile } from "../src/profile/repo";
import { syncUser } from "../src/users/repo";
import {
  addItem,
  finishSession,
  listExercises,
  startSession,
  upsertSet,
} from "../src/workouts/repo";
import { createTestDb } from "./db";

const emptyWeek = (): WeekStats => ({
  from: "2026-10-16",
  to: "2026-10-22",
  sessions: 0,
  setsByMuscle: Object.fromEntries(
    MUSCLE_GROUPS.map((m) => [m, 0]),
  ) as WeekStats["setsByMuscle"],
  cardioMinutes: 0,
});
const zero: Nutrition = { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 };

const full = (): AskContextData => ({
  today: "2026-10-22",
  profile: {
    sex: "male",
    birthYear: 1992,
    heightCm: 175,
    weightKg: 72.5,
    activityLevel: "moderate",
    goal: "cut",
    targetsOverridden: false,
    targets: { kcal: 2100, proteinG: 140, carbG: 230, fatG: 60 },
  },
  age: 34,
  floorKcal: 1670,
  consumedToday: { kcal: 1420, proteinG: 96, carbG: 150, fatG: 45 },
  workoutToday: "胸推日・5 個動作・4,000 kg",
  week: {
    ...emptyWeek(),
    sessions: 3,
    setsByMuscle: {
      ...emptyWeek().setsByMuscle,
      chest: 12,
      back: 10,
      quads: 15,
    },
    cardioMinutes: 40,
  },
  dietDays: [1800, 1900, 1850, 1850, 1850].map((kcal, i) => ({
    date: `2026-10-${15 + i}`,
    kcal,
    proteinG: 120,
    carbG: 200,
    fatG: 50,
  })),
});

const fresh = (): AskContextData => ({
  today: "2026-10-22",
  profile: null,
  age: null,
  floorKcal: 1500,
  consumedToday: zero,
  workoutToday: null,
  week: emptyWeek(),
  dietDays: [],
});

describe("buildAskContext", () => {
  it("renders every line for a full user", () => {
    expect(buildAskContext(full()).split("\n")).toEqual([
      "使用者資料：",
      "今天：2026-10-22（星期四）",
      "個人檔案：男，34 歲，身高 175 cm，體重 72.5 kg，活動量：中等（每週 3–5 天），目標：減脂",
      "每日目標：熱量 2100 kcal、蛋白質 140 g、碳水 230 g、脂肪 60 g",
      "每日熱量安全下限：1670 kcal",
      "今天已吃：熱量 1420 kcal、蛋白質 96 g、碳水 150 g、脂肪 45 g",
      "今天剩餘：熱量 680 kcal、蛋白質 44 g、碳水 80 g、脂肪 15 g",
      "今天訓練：胸推日・5 個動作・4,000 kg",
      "近 7 天訓練：3 次；重訓組數：胸 12、背 10、股四頭 15；有氧 40 分鐘",
      "近 7 天飲食：記錄 5 天，平均熱量 1850 kcal（目標的 88%），平均蛋白質 120 g（目標的 86%）",
    ]);
  });

  it("handles a brand-new user without NaN", () => {
    const text = buildAskContext(fresh());
    expect(text.split("\n")).toEqual([
      "使用者資料：",
      "今天：2026-10-22（星期四）",
      "個人檔案：尚未填寫",
      "每日熱量安全下限：1500 kcal",
      "今天已吃：熱量 0 kcal、蛋白質 0 g、碳水 0 g、脂肪 0 g",
      "今天訓練：還沒有訓練",
      "近 7 天訓練：沒有訓練",
      "近 7 天飲食：沒有記錄",
    ]);
    expect(text).not.toContain("每日目標");
    expect(text).not.toContain("今天剩餘");
    expect(text).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("omits percentages without a profile", () => {
    const d = { ...fresh(), dietDays: full().dietDays };
    expect(buildAskContext(d)).toContain(
      "近 7 天飲食：記錄 5 天，平均熱量 1850 kcal，平均蛋白質 120 g",
    );
  });

  it("writes 超過 when over target", () => {
    const d = {
      ...full(),
      consumedToday: { kcal: 2220, proteinG: 150, carbG: 250, fatG: 60 },
    };
    expect(buildAskContext(d)).toContain(
      "今天剩餘：熱量 超過 120 kcal、蛋白質 超過 10 g、碳水 超過 20 g、脂肪 0 g",
    );
  });
});

describe("todayLine", () => {
  it("reports remaining kcal and protein gap", () => {
    expect(todayLine(full())).toBe("今天還能吃 680 kcal・蛋白質還差 44 g");
  });
  it("reports overshoot", () => {
    const d = {
      ...full(),
      consumedToday: { kcal: 2220, proteinG: 150, carbG: 250, fatG: 60 },
    };
    expect(todayLine(d)).toBe("今天已超過 120 kcal・蛋白質已達標");
  });
  it("is null without a profile", () => {
    expect(todayLine(fresh())).toBeNull();
  });
});

describe("loadAskContext", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it("assembles data using Taipei dates", async () => {
    const t = await createTestDb();
    close = t.close;
    const db = t.db;
    const { userId } = await syncUser(db, "U1", "Amy");
    // 2026-10-21T17:00Z is already 2026-10-22 in Taipei.
    const now = new Date("2026-10-21T17:00:00Z");
    await saveProfile(
      db,
      userId,
      {
        sex: "male",
        birthYear: 1992,
        heightCm: 175,
        weightKg: 72.5,
        activityLevel: "moderate",
        goal: "cut",
      },
      "2026-10-22",
    );
    const [food] = await db
      .insert(foods)
      .values({
        source: "custom",
        sourceRef: "ctx-chicken",
        name: "測試雞胸",
        kcalPer100g: "120",
        proteinPer100g: "23.5",
        carbPer100g: "0",
        fatPer100g: "2.1",
      })
      .returning();
    if (!food) throw new Error("no food");
    for (const eatenOn of ["2026-10-20", "2026-10-21"]) {
      await createMeal(
        db,
        userId,
        {
          eatenOn,
          mealType: "lunch",
          items: [{ foodId: food.id, grams: 100 }],
        },
        "manual",
        now,
      );
    }
    const ex = (await listExercises(db, userId)).find(
      (e) => e.slug === "barbell-bench-press",
    );
    if (!ex) throw new Error("no exercise");
    const s = await startSession(db, userId, "2026-10-22");
    await addItem(db, userId, s.id, ex.id);
    await upsertSet(db, userId, s.id, ex.id, {
      setIndex: 1,
      weightKg: 60,
      reps: 10,
    });
    await finishSession(db, userId, s.id);

    const d = await loadAskContext(db, userId, now);
    expect(d.today).toBe("2026-10-22");
    expect(d.age).toBe(34);
    expect(d.profile?.sex).toBe("male");
    expect(d.floorKcal).toBeGreaterThanOrEqual(1500);
    expect(d.week.sessions).toBe(1);
    expect(d.week.setsByMuscle.chest).toBe(1);
    expect(d.dietDays.map((x) => x.date)).toEqual(["2026-10-20", "2026-10-21"]);
    expect(d.dietDays).toHaveLength(2);
    expect(d.workoutToday).not.toBeNull();
    expect(d.consumedToday.kcal).toBe(0);
  });

  it("returns defaults for a new user", async () => {
    const t = await createTestDb();
    close = t.close;
    const { userId } = await syncUser(t.db, "U1", "Amy");
    const d = await loadAskContext(
      t.db,
      userId,
      new Date("2026-10-22T04:00:00Z"),
    );
    expect(d).toMatchObject({
      today: "2026-10-22",
      profile: null,
      age: null,
      floorKcal: 1500,
      workoutToday: null,
      dietDays: [],
    });
    expect(d.week.sessions).toBe(0);
  });
});
