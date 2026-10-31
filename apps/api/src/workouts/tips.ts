import {
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUPS,
  overloadHint,
  type MuscleGroup,
  type SetLike,
} from "@gac/shared";

export interface TipInput {
  exercises: { nameZh: string; sets: SetLike[]; targetReps: number | null }[];
  volumeKg: number;
  previousVolumeKg: number | null; // same template's last finished session
  weekSetsByMuscle: Record<MuscleGroup, number>; // including this session
  taipeiWeekday: number; // 0 = Sunday
}

const MAX_TIPS = 3;
const MAX_OVERLOAD_TIPS = 2;
const MAX_MISSING_MUSCLES = 3;
const VOLUME_CHANGE_PCT = 5;
const FALLBACK = "完成了！記得補充蛋白質和水分。";

/** Thursday through Sunday: late enough in the week to point out gaps. */
const lateInWeek = (weekday: number) => weekday === 0 || weekday >= 4;

/** 1-3 rule-based tips for the finish summary. Pure: callers pass every input. */
export function buildWorkoutTips(input: TipInput): string[] {
  const tips: string[] = [];

  for (const ex of input.exercises) {
    if (tips.length >= MAX_OVERLOAD_TIPS) break;
    const hint = overloadHint(ex.sets, ex.targetReps);
    if (hint) tips.push(`下次${ex.nameZh}可以試試 ${hint.suggestWeightKg} kg`);
  }

  const prev = input.previousVolumeKg;
  if (prev !== null && prev > 0 && input.volumeKg > 0) {
    const pct = Math.round(((input.volumeKg - prev) / prev) * 100);
    if (pct >= VOLUME_CHANGE_PCT) tips.push(`總訓練量比上次多 ${pct}%`);
    else if (pct <= -VOLUME_CHANGE_PCT)
      tips.push(`總訓練量比上次少 ${-pct}%，可能是累了，記得睡飽`);
  }

  if (lateInWeek(input.taipeiWeekday)) {
    const missing = MUSCLE_GROUPS.filter((m) => input.weekSetsByMuscle[m] === 0)
      .slice(0, MAX_MISSING_MUSCLES)
      .map((m) => MUSCLE_GROUP_LABELS[m]);
    if (missing.length > 0) tips.push(`本週還沒練到：${missing.join("、")}`);
  }

  return tips.length === 0 ? [FALLBACK] : tips.slice(0, MAX_TIPS);
}
