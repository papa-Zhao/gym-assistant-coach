// Meal types and nutrition math. Pure functions, no I/O.

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "點心",
};

export const MEAL_STATUSES = ["draft", "confirmed"] as const;
export type MealStatus = (typeof MEAL_STATUSES)[number];

export const MEAL_SOURCES = ["photo", "text", "manual", "copy"] as const;
export type MealSource = (typeof MEAL_SOURCES)[number];

export const FOOD_SOURCES = ["tfda", "custom", "ai"] as const;
export type FoodSource = (typeof FOOD_SOURCES)[number];

export const AI_KINDS = ["photo", "text", "chat"] as const;
export type AiKind = (typeof AI_KINDS)[number];

/** Per-user daily AI call limits (Taipei day). */
export const AI_DAILY_LIMITS: Record<AiKind, number> = {
  photo: 10,
  text: 20,
  chat: 20,
};

/** Accepted grams per meal item (one decimal allowed). */
export const GRAMS_LIMITS = { min: 1, max: 2000 } as const;
export const MAX_MEAL_ITEMS = 30;

export interface Nutrition {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

export interface Food {
  id: string;
  source: FoodSource;
  name: string;
  aliases: string | null;
  category: string | null;
  per100g: {
    kcal: number;
    proteinG: number | null;
    carbG: number | null;
    fatG: number | null;
  };
}

export interface MealItem extends Nutrition {
  id: string;
  foodId: string | null;
  name: string;
  grams: number;
  /** AI estimate confidence 0-1; null for database and manual items. */
  aiConfidence: number | null;
}

export interface Meal {
  id: string;
  eatenOn: string;
  mealType: MealType;
  status: MealStatus;
  source: MealSource;
  items: MealItem[];
  total: Nutrition;
}

export const MEAL_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const MEAL_PHOTO_RETENTION_DAYS = 90;

export interface MealDetail extends Meal {
  photoUrl: string | null;
}

export interface DayMeals {
  date: string;
  meals: Meal[];
  consumed: Nutrition;
}

export interface MealItemInput {
  id?: string;
  foodId?: string;
  grams: number;
}

export interface MealInput {
  eatenOn: string;
  mealType: MealType;
  items: MealItemInput[];
}

// The epsilon keeps values like 14.55 (stored as 14.549999...) rounding up.
const EPS = 1e-9;

function round1(n: number): number {
  return Math.round(n * 10 + EPS) / 10;
}

/** Nutrition for `grams` of a food; kcal is an integer, macros 1 decimal. */
export function nutritionFor(
  per100g: Food["per100g"],
  grams: number,
): Nutrition {
  const f = grams / 100;
  return {
    kcal: Math.round(per100g.kcal * f + EPS),
    proteinG: round1((per100g.proteinG ?? 0) * f),
    carbG: round1((per100g.carbG ?? 0) * f),
    fatG: round1((per100g.fatG ?? 0) * f),
  };
}

/** Rescale a saved item's nutrition when its grams change. */
export function scaleNutrition(
  n: Nutrition,
  fromGrams: number,
  toGrams: number,
): Nutrition {
  if (!(fromGrams > 0)) throw new Error("fromGrams must be greater than 0");
  const f = toGrams / fromGrams;
  return {
    kcal: Math.round(n.kcal * f + EPS),
    proteinG: round1(n.proteinG * f),
    carbG: round1(n.carbG * f),
    fatG: round1(n.fatG * f),
  };
}

/** Sum without re-rounding values; only trims float noise to 1 decimal. */
export function sumNutrition(list: Nutrition[]): Nutrition {
  const t = { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 };
  for (const n of list) {
    t.kcal += n.kcal;
    t.proteinG += n.proteinG;
    t.carbG += n.carbG;
    t.fatG += n.fatG;
  }
  return {
    kcal: t.kcal,
    proteinG: round1(t.proteinG),
    carbG: round1(t.carbG),
    fatG: round1(t.fatG),
  };
}

/** Meal type guess from the Asia/Taipei hour (0-23). */
export function defaultMealType(taipeiHour: number): MealType {
  if (taipeiHour >= 4 && taipeiHour <= 10) return "breakfast";
  if (taipeiHour >= 11 && taipeiHour <= 14) return "lunch";
  if (taipeiHour >= 17 && taipeiHour <= 21) return "dinner";
  return "snack";
}

/** 1-2000 g with at most one decimal; float-safe (1.2 and 2.3 are valid). */
export function isValidGrams(g: number): boolean {
  if (!Number.isFinite(g)) return false;
  if (g < GRAMS_LIMITS.min || g > GRAMS_LIMITS.max) return false;
  return Math.abs(g * 10 - Math.round(g * 10)) < 1e-9;
}
