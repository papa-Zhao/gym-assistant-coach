import {
  EQUIPMENT_LABELS,
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  weekRange,
  type CardioEntry,
  type SessionItem,
  type WeekStats,
  type WorkoutSet,
} from "@gac/shared";
import { GOAL_LABELS } from "../ask/context";
import { getProfile } from "../profile/repo";
import type { Db } from "../users/repo";
import { getSessionById, weekStats } from "./repo";

const mmss = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

function setText(s: WorkoutSet): string {
  const extra = [
    ...(s.rpe === undefined ? [] : [`RPE ${s.rpe}`]),
    ...(s.restSec === undefined ? [] : [`休息 ${mmss(s.restSec)}`]),
  ];
  const base = `${s.weightKg} kg × ${s.reps} 下`;
  return extra.length === 0 ? base : `${base}（${extra.join("、")}）`;
}

function cardioText(c: CardioEntry): string {
  const parts = [`${c.durationMin} 分鐘`];
  if (c.distanceKm !== undefined) parts.push(`${c.distanceKm} km`);
  if (c.speedKmh !== undefined) parts.push(`時速 ${c.speedKmh} km`);
  if (c.inclinePct !== undefined) parts.push(`坡度 ${c.inclinePct}%`);
  if (c.level !== undefined) parts.push(`強度 ${c.level}`);
  return parts.join("、");
}

function itemLine(item: SessionItem): string | null {
  const ex = item.exercise;
  const tags = [
    ex.muscleGroup ? MUSCLE_GROUP_LABELS[ex.muscleGroup] : "有氧",
    EQUIPMENT_LABELS[ex.equipment],
  ].join("，");
  const head = `- ${ex.nameZh}（${tags}）：`;
  if ("cardio" in item) {
    if (item.cardio.length === 0) return null;
    return head + item.cardio.map(cardioText).join("；");
  }
  if (item.sets.length === 0) return null;
  const parts = [item.sets.map(setText).join("、")];
  if (item.targetSets !== null && item.targetReps !== null) {
    parts.push(`目標 ${item.targetSets} 組 × ${item.targetReps} 下`);
  }
  if (item.last)
    parts.push(`上一次：${item.last.sets.map(setText).join("、")}`);
  return head + parts.join("；");
}

function weekLines(w: WeekStats): string[] {
  const sets = MUSCLE_GROUPS.filter((m) => w.setsByMuscle[m] > 0).map(
    (m) => `${MUSCLE_GROUP_LABELS[m]} ${w.setsByMuscle[m]}`,
  );
  const lines = [
    sets.length > 0
      ? `本週各肌群組數：${sets.join("、")}`
      : "本週各肌群組數：還沒有重訓",
  ];
  if (w.cardioMinutes > 0) lines.push(`本週有氧：${w.cardioMinutes} 分鐘`);
  return lines;
}

/**
 * The training-data block sent to Claude for one of the user's sessions:
 * every set, the last time for each exercise, this week's sets per muscle
 * and the profile goal. No names or LINE ids. Throws `not_found` if foreign.
 */
export async function workoutAdviceContext(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<string> {
  const session = await getSessionById(db, userId, sessionId);
  const { from, to } = weekRange(session.date);
  const [profile, week] = await Promise.all([
    getProfile(db, userId),
    weekStats(db, userId, from, to),
  ]);
  return [
    "訓練資料：",
    profile ? `個人目標：${GOAL_LABELS[profile.goal]}` : "個人檔案：尚未填寫",
    `這次訓練：${session.templateName ?? "自由訓練"}`,
    ...session.items.flatMap((i) => itemLine(i) ?? []),
    ...weekLines(week),
  ].join("\n");
}
