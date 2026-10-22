import { addDays, roundMetric } from "./metrics";

export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: "胸",
  back: "背",
  shoulders: "肩",
  biceps: "二頭",
  triceps: "三頭",
  quads: "股四頭",
  hamstrings: "腿後",
  glutes: "臀",
  calves: "小腿",
  core: "核心",
};

export const EXERCISE_KINDS = ["strength", "cardio"] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];

export const EXERCISE_KIND_LABELS: Record<ExerciseKind, string> = {
  strength: "重訓",
  cardio: "有氧",
};

export const EQUIPMENT = [
  "selectorized_machine",
  "plate_loaded_machine",
  "smith_machine",
  "cable",
  "barbell",
  "dumbbell",
  "kettlebell",
  "ez_bar",
  "bodyweight",
  "treadmill",
  "stair_climber",
  "stationary_bike",
  "rower",
  "elliptical",
  "none",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  selectorized_machine: "插銷式機械",
  plate_loaded_machine: "掛片式機械",
  smith_machine: "史密斯機",
  cable: "滑輪",
  barbell: "槓鈴",
  dumbbell: "啞鈴",
  kettlebell: "壺鈴",
  ez_bar: "曲槓",
  bodyweight: "自體重量",
  treadmill: "跑步機",
  stair_climber: "階梯機",
  stationary_bike: "飛輪／固定式腳踏車",
  rower: "划船機",
  elliptical: "橢圓機",
  none: "無器材",
};

export const EQUIPMENT_CATEGORIES = [
  "machine",
  "semi_machine",
  "free_weight",
  "bodyweight",
  "cardio_equipment",
] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

export const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  machine: "機械式",
  semi_machine: "半機械式",
  free_weight: "自由重量",
  bodyweight: "徒手",
  cardio_equipment: "有氧器材",
};

const EQUIPMENT_TO_CATEGORY: Record<Equipment, EquipmentCategory> = {
  selectorized_machine: "machine",
  plate_loaded_machine: "machine",
  smith_machine: "semi_machine",
  cable: "semi_machine",
  barbell: "free_weight",
  dumbbell: "free_weight",
  kettlebell: "free_weight",
  ez_bar: "free_weight",
  bodyweight: "bodyweight",
  treadmill: "cardio_equipment",
  stair_climber: "cardio_equipment",
  stationary_bike: "cardio_equipment",
  rower: "cardio_equipment",
  elliptical: "cardio_equipment",
  none: "cardio_equipment",
};

export function equipmentCategory(equipment: Equipment): EquipmentCategory {
  return EQUIPMENT_TO_CATEGORY[equipment];
}

export const SET_LIMITS = {
  reps: { min: 1, max: 100 },
  weightKg: { min: 0, max: 500 },
  rpe: { min: 1, max: 10 },
  restSec: { min: 0, max: 3600 },
} as const;

export const CARDIO_LIMITS = {
  durationMin: { min: 1, max: 600 },
  distanceKm: { min: 0, max: 100 },
  inclinePct: { min: 0, max: 40 },
  speedKmh: { min: 0, max: 40 },
  level: { min: 1, max: 30 },
} as const;

export interface SetLike {
  weightKg: number;
  reps: number;
}

// Epley: weight * (1 + reps / 30), only for 1-12 reps with weight > 0.
export function estimate1RM(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || reps < 1 || reps > 12) return null;
  return roundMetric(weightKg * (1 + reps / 30));
}

export function bestE1RM(sets: SetLike[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    const e = estimate1RM(s.weightKg, s.reps);
    if (e !== null && (best === null || e > best)) best = e;
  }
  return best;
}

export const OVERLOAD_STEP_KG = 2.5;

export function overloadHint(
  last: SetLike[],
  targetReps: number | null,
): { suggestWeightKg: number } | null {
  const first = last[0];
  if (!first) return null;
  const target = targetReps ?? first.reps;
  if (!last.every((s) => s.reps >= target)) return null;
  const top = Math.max(...last.map((s) => s.weightKg));
  if (top === 0) return null; // bodyweight history: no kg to add to
  return { suggestWeightKg: top + OVERLOAD_STEP_KG };
}

// Monday-Sunday week containing `today` (YYYY-MM-DD). Weekday via UTC.
export function weekRange(today: string): { from: string; to: string } {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const sinceMonday = (dow + 6) % 7;
  const from = addDays(today, -sinceMonday);
  return { from, to: addDays(from, 6) };
}

export function volume(sets: SetLike[]): number {
  return sets.reduce((sum, s) => sum + s.weightKg * s.reps, 0);
}

export interface Exercise {
  id: string;
  slug: string | null;
  nameZh: string;
  nameEn: string | null;
  kind: ExerciseKind;
  muscleGroup: MuscleGroup | null;
  equipment: Equipment;
  equipmentCategory: EquipmentCategory;
  isCustom: boolean;
}

/** Prefill for the custom-exercise form after an equipment photo. */
export interface ExerciseSuggestion {
  nameZh: string;
  kind: ExerciseKind;
  muscleGroup: MuscleGroup | null;
  equipment: Equipment;
}

export type IdentifyEquipmentResponse =
  | {
      outcome: "found";
      equipment: Equipment;
      candidates: Exercise[];
      suggestion: ExerciseSuggestion;
    }
  | {
      outcome:
        "not_equipment" | "limit" | "refused" | "unavailable" | "invalid_image";
    };

export interface WorkoutSet {
  setIndex: number;
  weightKg: number;
  reps: number;
  rpe?: number;
  /** Seconds rested before this set, when known. */
  restSec?: number;
  /** ISO timestamp of when the set was last saved. */
  completedAt: string;
}

export interface CardioEntry {
  entryIndex: number;
  durationMin: number;
  distanceKm?: number;
  inclinePct?: number;
  speedKmh?: number;
  level?: number;
}

export interface OverloadHint {
  suggestWeightKg: number;
}

interface SessionItemBase {
  exercise: Exercise;
  last: { date: string; sets: WorkoutSet[] } | null;
  hint: OverloadHint | null;
  targetSets: number | null;
  targetReps: number | null;
}

export type SessionItem =
  | (SessionItemBase & { sets: WorkoutSet[] })
  | (SessionItemBase & { cardio: CardioEntry[] });

export interface ActiveSession {
  id: string;
  date: string;
  startedAt: string;
  templateId: string | null;
  templateName: string | null;
  items: SessionItem[];
}

export interface FinishSummary {
  sessionId: string;
  volumeKg: number;
  exerciseCount: number;
  setCount: number;
  cardioMinutes: number;
  /** Average recorded rest between sets, rounded to whole seconds; null if none recorded. */
  avgRestSec: number | null;
  prs: {
    exerciseId: string;
    nameZh: string;
    nameEn: string | null;
    e1rm: number;
    weightKg: number;
    reps: number;
  }[];
  notified: boolean;
}

export interface Template {
  id: string;
  name: string;
  items: { exercise: Exercise; targetSets: number; targetReps: number }[];
}

export interface WeekStats {
  from: string;
  to: string;
  sessions: number;
  setsByMuscle: Record<MuscleGroup, number>;
  cardioMinutes: number;
}
