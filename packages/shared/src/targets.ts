// Profile target calculation (Mifflin-St Jeor). Pure functions, no I/O.

export type Sex = "male" | "female";
export type ActivityLevel =
  "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "cut" | "maintain" | "bulk";

export interface ProfileInput {
  sex: Sex;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
}

export interface Targets {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

/** Accepted range (integers) for saved daily targets; shared by LIFF and api. */
export const TARGET_LIMITS = {
  kcal: { min: 800, max: 10000 },
  gram: { min: 0, max: 2000 },
} as const;

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const GOAL_ADJUST_KCAL: Record<Goal, number> = {
  cut: -500,
  maintain: 0,
  bulk: 250,
};

export const PROTEIN_G_PER_KG: Record<Goal, number> = {
  cut: 2.0,
  maintain: 1.6,
  bulk: 1.8,
};

const SEX_MIN_KCAL: Record<Sex, number> = { female: 1200, male: 1500 };
const FAT_KCAL_SHARE = 0.25;

const round10 = (n: number): number => Math.round(n / 10) * 10;
const ceil10 = (n: number): number => Math.ceil(n / 10) * 10;

function ageOn(birthYear: number, today: string): number {
  return Number(today.slice(0, 4)) - birthYear;
}

function bmrOf(input: ProfileInput, today: string): number {
  return (
    10 * input.weightKg +
    6.25 * input.heightCm -
    5 * ageOn(input.birthYear, today) +
    (input.sex === "male" ? 5 : -161)
  );
}

export function floorKcal(sex: Sex, bmr: number): number {
  return ceil10(Math.max(bmr, SEX_MIN_KCAL[sex]));
}

export function calcTargets(
  input: ProfileInput,
  today: string,
): {
  bmr: number;
  targets: Targets;
  floorKcal: number;
  clampedToFloor: boolean;
} {
  const bmr = bmrOf(input, today);
  const floor = floorKcal(input.sex, bmr);
  let kcal = round10(
    bmr * ACTIVITY_FACTORS[input.activityLevel] + GOAL_ADJUST_KCAL[input.goal],
  );
  let clampedToFloor = false;
  if (kcal < floor) {
    kcal = floor;
    clampedToFloor = true;
  }
  const proteinG = Math.round(input.weightKg * PROTEIN_G_PER_KG[input.goal]);
  const fatG = Math.round((kcal * FAT_KCAL_SHARE) / 9);
  const carbG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return {
    bmr,
    targets: { kcal, proteinG, carbG, fatG },
    floorKcal: floor,
    clampedToFloor,
  };
}

export function isBelowFloor(
  input: ProfileInput,
  kcal: number,
  today: string,
): boolean {
  return kcal < floorKcal(input.sex, bmrOf(input, today));
}

/** Returns the names of invalid `ProfileInput` fields (empty when valid). */
export function validateProfile(input: ProfileInput, today: string): string[] {
  const bad: string[] = [];
  const age = ageOn(input.birthYear, today);
  if (!Number.isInteger(input.birthYear) || age < 18 || age > 100)
    bad.push("birthYear");
  if (!(input.heightCm >= 100 && input.heightCm <= 250)) bad.push("heightCm");
  if (!(input.weightKg >= 30 && input.weightKg <= 300)) bad.push("weightKg");
  if (input.sex !== "male" && input.sex !== "female") bad.push("sex");
  if (!Object.hasOwn(ACTIVITY_FACTORS, input.activityLevel))
    bad.push("activityLevel");
  if (!Object.hasOwn(GOAL_ADJUST_KCAL, input.goal)) bad.push("goal");
  return bad;
}

/** Hour (0-23) of the given instant in Asia/Taipei. */
export function taipeiHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Taipei",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
}

/** `YYYY-MM-DD` of the given instant in Asia/Taipei. */
export function taipeiDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
