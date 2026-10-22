import {
  GRAMS_LIMITS,
  MAX_MEAL_ITEMS,
  taipeiDate,
  type Meal,
  type MealType,
} from "@gac/shared";
import {
  MealParserUnavailable,
  type MealParser,
  type ParsedItem,
} from "../ai/meal-parser";
import { addAiTokens, releaseAiUse, reserveAiUse } from "../ai/usage";
import type { Db } from "../users/repo";
import { createDraftMeal, type DraftItem } from "./repo";

export type TextMealOutcome =
  | { kind: "draft"; meal: Meal }
  | { kind: "limit" }
  | { kind: "not_food" }
  | { kind: "refused" }
  | { kind: "unavailable" };

const MAX_NAME_CHARS = 30;
// Columns are numeric(6,1) and integer; anything larger cannot be stored.
const MAX_MACRO_G = 99999;
const MAX_KCAL = 1_000_000;
// Keeps values like 150.55 (stored as 150.549999...) rounding up.
const EPS = 1e-9;

const round1 = (n: number) => Math.round(n * 10 + EPS) / 10;
const round2 = (n: number) => Math.round(n * 100 + EPS) / 100;
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

function sanitizeItem(item: ParsedItem): DraftItem | null {
  const name = Array.from(item.name.trim()).slice(0, MAX_NAME_CHARS).join("");
  if (name === "") return null;
  if (!Number.isFinite(item.grams)) return null;
  const macros = [item.proteinG, item.carbG, item.fatG];
  if (![item.kcal, ...macros].every((n) => Number.isFinite(n) && n >= 0)) {
    return null;
  }
  if (item.kcal > MAX_KCAL || macros.some((n) => n > MAX_MACRO_G)) return null;
  const confidence = Number.isFinite(item.confidence) ? item.confidence : 0;
  return {
    name,
    grams: clamp(round1(item.grams), GRAMS_LIMITS.min, GRAMS_LIMITS.max),
    kcal: Math.round(item.kcal),
    proteinG: round1(item.proteinG),
    carbG: round1(item.carbG),
    fatG: round1(item.fatG),
    aiConfidence: round2(clamp(confidence, 0, 1)),
  };
}

/** Clamps and filters AI items to storable values; drops items it cannot fix. */
export function sanitizeItems(items: ParsedItem[]): DraftItem[] {
  const out: DraftItem[] = [];
  for (const item of items) {
    const fixed = sanitizeItem(item);
    if (fixed) out.push(fixed);
    if (out.length === MAX_MEAL_ITEMS) break;
  }
  return out;
}

export async function logMealFromText(
  deps: { db: Db; parser: MealParser; now: () => Date },
  userId: string,
  mealType: MealType,
  text: string,
): Promise<TextMealOutcome> {
  const { db, parser } = deps;
  const now = deps.now();
  const day = taipeiDate(now);
  if (!(await reserveAiUse(db, userId, "text", day))) return { kind: "limit" };

  let result;
  try {
    result = await parser.parseText(text);
  } catch (err) {
    if (err instanceof MealParserUnavailable) {
      await releaseAiUse(db, userId, "text", day);
      return { kind: "unavailable" };
    }
    throw err;
  }
  await addAiTokens(db, userId, "text", day, result.usage);

  if (result.kind === "refused") return { kind: "refused" };
  if (result.kind === "not_food") return { kind: "not_food" };
  const items = sanitizeItems(result.items);
  if (items.length === 0) return { kind: "not_food" };
  const meal = await createDraftMeal(
    db,
    userId,
    { eatenOn: day, mealType, items },
    "text",
    now,
  );
  return { kind: "draft", meal };
}
