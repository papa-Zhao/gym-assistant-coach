import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  addDays,
  calcTargets,
  taipeiDate,
  type ActivityLevel,
  type Goal,
  type Nutrition,
  type Sex,
  type WeekStats,
} from "@gac/shared";
import { dailyConsumed, consumedOn } from "../meals/repo";
import { getProfile, type StoredProfile } from "../profile/repo";
import type { Db } from "../users/repo";
import { todayWorkoutSummary, weekStats } from "../workouts/repo";
import { formatWorkoutSummary } from "../workouts/summary";
import { UNKNOWN_FLOOR_KCAL } from "./safety";

// Same wording as apps/liff/src/pages/Profile.tsx.
const SEX_LABELS: Record<Sex, string> = { male: "男", female: "女" };
const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "久坐（幾乎不運動）",
  light: "輕度（每週 1–3 天）",
  moderate: "中等（每週 3–5 天）",
  active: "活躍（每週 6–7 天）",
  very_active: "非常活躍（體力工作或一天兩練）",
};
const GOAL_LABELS: Record<Goal, string> = {
  cut: "減脂",
  maintain: "維持",
  bulk: "增肌",
};
const WEEKDAYS = "日一二三四五六";

export interface AskContextData {
  today: string;
  profile: StoredProfile | null;
  age: number | null;
  floorKcal: number;
  consumedToday: Nutrition;
  workoutToday: string | null;
  week: WeekStats;
  dietDays: ({ date: string } & Nutrition)[];
}

export async function loadAskContext(
  db: Db,
  userId: string,
  now: Date,
): Promise<AskContextData> {
  const today = taipeiDate(now);
  const profile = await getProfile(db, userId);
  const [consumedToday, summary, week, dietDays] = await Promise.all([
    consumedOn(db, userId, today, now),
    todayWorkoutSummary(db, userId, today),
    weekStats(db, userId, addDays(today, -6), today),
    dailyConsumed(db, userId, addDays(today, -7), addDays(today, -1)),
  ]);
  return {
    today,
    profile,
    age: profile ? Number(today.slice(0, 4)) - profile.birthYear : null,
    floorKcal: profile
      ? calcTargets(profile, today).floorKcal
      : UNKNOWN_FLOOR_KCAL,
    consumedToday,
    workoutToday: summary ? formatWorkoutSummary(summary) : null,
    week,
    dietDays,
  };
}

const int = (n: number) => String(Math.round(n));

function weekday(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return `星期${WEEKDAYS.charAt(day)}`;
}

/** "680 kcal", or "超過 120 kcal" when the remainder is negative. */
function remaining(target: number, eaten: number, unit: string): string {
  const left = Math.round(target) - Math.round(eaten);
  return left < 0 ? `超過 ${-left} ${unit}` : `${left} ${unit}`;
}

function profileLine(p: StoredProfile, age: number | null): string {
  const ageText = age === null ? "" : `${age} 歲，`;
  return `個人檔案：${SEX_LABELS[p.sex]}，${ageText}身高 ${p.heightCm} cm，體重 ${p.weightKg} kg，活動量：${ACTIVITY_LABELS[p.activityLevel]}，目標：${GOAL_LABELS[p.goal]}`;
}

function weekLine(w: WeekStats): string {
  if (w.sessions === 0) return "近 7 天訓練：沒有訓練";
  const parts = [`${w.sessions} 次`];
  const sets = MUSCLE_GROUPS.filter((m) => w.setsByMuscle[m] > 0).map(
    (m) => `${MUSCLE_GROUP_LABELS[m]} ${w.setsByMuscle[m]}`,
  );
  if (sets.length > 0) parts.push(`重訓組數：${sets.join("、")}`);
  if (w.cardioMinutes > 0) parts.push(`有氧 ${w.cardioMinutes} 分鐘`);
  return `近 7 天訓練：${parts.join("；")}`;
}

function dietLine(d: AskContextData): string {
  const n = d.dietDays.length;
  if (n === 0) return "近 7 天飲食：沒有記錄";
  const avg = (pick: (x: Nutrition) => number) =>
    d.dietDays.reduce((a, x) => a + pick(x), 0) / n;
  const pct = (value: number, target: number | undefined) =>
    target && target > 0
      ? `（目標的 ${Math.round((value / target) * 100)}%）`
      : "";
  const kcal = avg((x) => x.kcal);
  const protein = avg((x) => x.proteinG);
  const t = d.profile?.targets;
  return `近 7 天飲食：記錄 ${n} 天，平均熱量 ${int(kcal)} kcal${pct(kcal, t?.kcal)}，平均蛋白質 ${int(protein)} g${pct(protein, t?.proteinG)}`;
}

/** The user-data block sent to Claude. Pure. */
export function buildAskContext(d: AskContextData): string {
  const c = d.consumedToday;
  const t = d.profile?.targets;
  const lines = [
    "使用者資料：",
    `今天：${d.today}（${weekday(d.today)}）`,
    d.profile ? profileLine(d.profile, d.age) : "個人檔案：尚未填寫",
  ];
  if (t) {
    lines.push(
      `每日目標：熱量 ${t.kcal} kcal、蛋白質 ${t.proteinG} g、碳水 ${t.carbG} g、脂肪 ${t.fatG} g`,
    );
  }
  lines.push(
    `每日熱量安全下限：${d.floorKcal} kcal`,
    `今天已吃：熱量 ${int(c.kcal)} kcal、蛋白質 ${int(c.proteinG)} g、碳水 ${int(c.carbG)} g、脂肪 ${int(c.fatG)} g`,
  );
  if (t) {
    lines.push(
      `今天剩餘：熱量 ${remaining(t.kcal, c.kcal, "kcal")}、蛋白質 ${remaining(t.proteinG, c.proteinG, "g")}、碳水 ${remaining(t.carbG, c.carbG, "g")}、脂肪 ${remaining(t.fatG, c.fatG, "g")}`,
    );
  }
  lines.push(
    `今天訓練：${d.workoutToday ?? "還沒有訓練"}`,
    weekLine(d.week),
    dietLine(d),
  );
  return lines.join("\n");
}

/** "今天還能吃 680 kcal・蛋白質還差 44 g"; null without a profile. */
export function todayLine(d: AskContextData): string | null {
  const t = d.profile?.targets;
  if (!t) return null;
  const kcalLeft = Math.round(t.kcal) - Math.round(d.consumedToday.kcal);
  const proteinLeft =
    Math.round(t.proteinG) - Math.round(d.consumedToday.proteinG);
  const head =
    kcalLeft >= 0
      ? `今天還能吃 ${kcalLeft} kcal`
      : `今天已超過 ${-kcalLeft} kcal`;
  const tail = proteinLeft > 0 ? `蛋白質還差 ${proteinLeft} g` : "蛋白質已達標";
  return `${head}・${tail}`;
}
