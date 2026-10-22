import {
  MAX_MEAL_ITEMS,
  MEAL_TYPES,
  nutritionFor,
  scaleNutrition,
  sumNutrition,
  type DayMeals,
  type Food,
  type FoodSource,
  type Meal,
  type MealInput,
  type MealItem,
  type MealSource,
  type MealStatus,
  type MealType,
  type Nutrition,
} from "@gac/shared";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { foods, mealItems, meals } from "../db/schema";
import type { Db } from "../users/repo";

export type MealInputErrorCode =
  "unknown_food" | "unknown_item" | "empty" | "too_many";

/** Typed failure so routes can map it to 400. */
export class MealInputError extends Error {
  constructor(readonly code: MealInputErrorCode) {
    super(code);
    this.name = "MealInputError";
  }
}

const DRAFT_WINDOW_MS = 24 * 60 * 60 * 1000;

type FoodRow = typeof foods.$inferSelect;
type MealRow = typeof meals.$inferSelect;
type ItemRow = typeof mealItems.$inferSelect;

const num = (v: string | null): number | null =>
  v === null ? null : Number(v);

function toFood(r: FoodRow): Food {
  return {
    id: r.id,
    source: r.source as FoodSource,
    name: r.name,
    aliases: r.aliases,
    category: r.category,
    per100g: {
      kcal: Number(r.kcalPer100g),
      proteinG: num(r.proteinPer100g),
      carbG: num(r.carbPer100g),
      fatG: num(r.fatPer100g),
    },
  };
}

function toItem(r: ItemRow): MealItem {
  return {
    id: r.id,
    foodId: r.foodId,
    name: r.name,
    grams: Number(r.grams),
    kcal: r.kcal,
    proteinG: Number(r.proteinG),
    carbG: Number(r.carbG),
    fatG: Number(r.fatG),
  };
}

function toMeal(r: MealRow, items: MealItem[]): Meal {
  return {
    id: r.id,
    eatenOn: r.eatenOn,
    mealType: r.mealType as MealType,
    status: r.status as MealStatus,
    source: r.source as MealSource,
    items,
    total: sumNutrition(items),
  };
}

export async function searchFoods(
  db: Db,
  q: string,
  limit = 20,
): Promise<Food[]> {
  const term = q.trim();
  if (!term) return [];
  const escaped = term.replace(/[\\%_]/g, "\\$&");
  const contains = `%${escaped}%`;
  const prefix = `${escaped}%`;
  const rank = sql`case
    when lower(${foods.name}) = lower(${term}) then 0
    when ${foods.name} ilike ${prefix} then 1
    when ${foods.name} ilike ${contains} then 2
    else 3 end`;
  const rows = await db
    .select()
    .from(foods)
    .where(
      sql`${foods.name} ilike ${contains} or ${foods.aliases} ilike ${contains}`,
    )
    .orderBy(rank, sql`length(${foods.name})`, asc(foods.name))
    .limit(limit);
  return rows.map(toFood);
}

async function loadMeals(db: Db, rows: MealRow[]): Promise<Meal[]> {
  if (rows.length === 0) return [];
  const itemRows = await db
    .select()
    .from(mealItems)
    .where(
      inArray(
        mealItems.mealId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(mealItems.position));
  const byMeal = new Map<string, MealItem[]>();
  for (const r of itemRows) {
    const list = byMeal.get(r.mealId) ?? [];
    list.push(toItem(r));
    byMeal.set(r.mealId, list);
  }
  return rows.map((r) => toMeal(r, byMeal.get(r.id) ?? []));
}

export async function getMeal(
  db: Db,
  userId: string,
  mealId: string,
): Promise<Meal | null> {
  const [row] = await db
    .select()
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId)));
  if (!row) return null;
  return loadMeal(db, row);
}

function one<T>(v: T | undefined): T {
  if (v === undefined) throw new Error("expected a row");
  return v;
}

async function loadMeal(db: Db, row: MealRow | undefined): Promise<Meal> {
  return one((await loadMeals(db, [one(row)]))[0]);
}

export async function listDayMeals(
  db: Db,
  userId: string,
  date: string,
  now: Date,
): Promise<DayMeals> {
  const rows = await db
    .select()
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.eatenOn, date)))
    .orderBy(asc(meals.createdAt));
  const typeOrder = (r: MealRow) => MEAL_TYPES.indexOf(r.mealType as MealType);
  // Array.sort is stable, so created_at order survives within a meal type.
  rows.sort((a, b) => typeOrder(a) - typeOrder(b));
  const list = await loadMeals(db, rows);
  const createdAt = new Map(rows.map((r) => [r.id, r.createdAt]));
  const cutoff = now.getTime() - DRAFT_WINDOW_MS;
  const consumed = sumNutrition(
    list
      .filter(
        (m) =>
          m.status === "confirmed" ||
          one(createdAt.get(m.id)).getTime() > cutoff,
      )
      .map((m) => m.total),
  );
  return { date, meals: list, consumed };
}

export async function consumedOn(
  db: Db,
  userId: string,
  date: string,
  now: Date,
): Promise<Nutrition> {
  return (await listDayMeals(db, userId, date, now)).consumed;
}

type NewItem = Nutrition & {
  id?: string;
  foodId: string | null;
  name: string;
  grams: number;
};

/** Validate input and compute the rows to store. Reads only. */
async function buildItems(
  tx: Db,
  items: MealInput["items"],
  existing: MealItem[],
): Promise<NewItem[]> {
  if (items.length === 0) throw new MealInputError("empty");
  if (items.length > MAX_MEAL_ITEMS) throw new MealInputError("too_many");

  const foodIds = [
    ...new Set(items.flatMap((i) => (i.id ? [] : i.foodId ? [i.foodId] : []))),
  ];
  const foodRows = foodIds.length
    ? await tx.select().from(foods).where(inArray(foods.id, foodIds))
    : [];
  const foodById = new Map(foodRows.map((r) => [r.id, toFood(r)]));
  const existingById = new Map(existing.map((i) => [i.id, i]));
  const used = new Set<string>();

  return items.map((input) => {
    if (input.id) {
      const old = existingById.get(input.id);
      if (!old || used.has(old.id)) throw new MealInputError("unknown_item");
      used.add(old.id);
      return {
        id: old.id,
        foodId: old.foodId,
        name: old.name,
        grams: input.grams,
        ...scaleNutrition(old, old.grams, input.grams),
      };
    }
    const food = input.foodId ? foodById.get(input.foodId) : undefined;
    if (!food) throw new MealInputError("unknown_food");
    return {
      foodId: food.id,
      name: food.name,
      grams: input.grams,
      ...nutritionFor(food.per100g, input.grams),
    };
  });
}

function itemValues(mealId: string, items: NewItem[]) {
  return items.map((it, position) => ({
    ...(it.id ? { id: it.id } : {}),
    mealId,
    position,
    foodId: it.foodId,
    name: it.name,
    grams: String(it.grams),
    kcal: it.kcal,
    proteinG: String(it.proteinG),
    carbG: String(it.carbG),
    fatG: String(it.fatG),
  }));
}

export async function createMeal(
  db: Db,
  userId: string,
  input: MealInput,
  source: MealSource,
  now: Date,
): Promise<Meal> {
  return db.transaction(async (tx) => {
    const items = await buildItems(tx, input.items, []);
    const inserted = await tx
      .insert(meals)
      .values({
        userId,
        eatenOn: input.eatenOn,
        mealType: input.mealType,
        status: "confirmed",
        source,
        createdAt: now,
        updatedAt: now,
        confirmedAt: now,
      })
      .returning();
    const row = one(inserted[0]);
    await tx.insert(mealItems).values(itemValues(row.id, items));
    return loadMeal(tx, row);
  });
}

export async function updateMeal(
  db: Db,
  userId: string,
  mealId: string,
  input: Omit<MealInput, "eatenOn">,
  now: Date,
): Promise<Meal | null> {
  return db.transaction(async (tx) => {
    const current = await getMeal(tx, userId, mealId);
    if (!current) return null;
    const items = await buildItems(tx, input.items, current.items);
    await tx.delete(mealItems).where(eq(mealItems.mealId, mealId));
    await tx.insert(mealItems).values(itemValues(mealId, items));
    const updated = await tx
      .update(meals)
      .set({
        mealType: input.mealType,
        status: "confirmed",
        confirmedAt: now,
        updatedAt: now,
      })
      .where(and(eq(meals.id, mealId), eq(meals.userId, userId)))
      .returning();
    return loadMeal(tx, updated[0]);
  });
}

export async function deleteMeal(
  db: Db,
  userId: string,
  mealId: string,
): Promise<boolean> {
  const rows = await db
    .delete(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId)))
    .returning({ id: meals.id });
  return rows.length > 0;
}
