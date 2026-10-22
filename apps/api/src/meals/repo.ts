import {
  MAX_MEAL_ITEMS,
  MEAL_PHOTO_RETENTION_DAYS,
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
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { foods, mealItems, mealPhotos, meals } from "../db/schema";
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
    aiConfidence: num(r.aiConfidence),
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
  // TODO(7.2): custom/AI foods (owner_user_id set) must be scoped to their owner here.
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

/** Confirmed meals only: one row per day in [from, to] that has any, ascending. */
export async function dailyConsumed(
  db: Db,
  userId: string,
  from: string,
  to: string,
): Promise<({ date: string } & Nutrition)[]> {
  const rows = await db
    .select({
      date: meals.eatenOn,
      kcal: sql<number>`coalesce(sum(${mealItems.kcal}), 0)::int`,
      proteinG: sql<string>`round(coalesce(sum(${mealItems.proteinG}), 0), 1)`,
      carbG: sql<string>`round(coalesce(sum(${mealItems.carbG}), 0), 1)`,
      fatG: sql<string>`round(coalesce(sum(${mealItems.fatG}), 0), 1)`,
    })
    .from(meals)
    .innerJoin(mealItems, eq(mealItems.mealId, meals.id))
    .where(
      and(
        eq(meals.userId, userId),
        eq(meals.status, "confirmed"),
        gte(meals.eatenOn, from),
        lte(meals.eatenOn, to),
      ),
    )
    .groupBy(meals.eatenOn)
    .orderBy(asc(meals.eatenOn));
  return rows.map((r) => ({
    date: r.date,
    kcal: r.kcal,
    proteinG: Number(r.proteinG),
    carbG: Number(r.carbG),
    fatG: Number(r.fatG),
  }));
}

type NewItem = Nutrition & {
  id?: string;
  foodId: string | null;
  name: string;
  grams: number;
  aiConfidence?: number | null;
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
        aiConfidence: old.aiConfidence,
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
    aiConfidence: it.aiConfidence == null ? null : String(it.aiConfidence),
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
    // Row lock serialises overlapping PUTs on one meal so the
    // (meal_id, position) key is never hit by interleaved delete/insert.
    const locked = await tx
      .select({ id: meals.id })
      .from(meals)
      .where(and(eq(meals.id, mealId), eq(meals.userId, userId)))
      .for("update");
    if (locked.length === 0) return null;
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

/** Deletes the user's meal; returns photo keys for object cleanup, null if none. */
export async function deleteMeal(
  db: Db,
  userId: string,
  mealId: string,
): Promise<{ photoKeys: string[] } | null> {
  return db.transaction(async (tx) => {
    const photos = await tx
      .select({ objectKey: mealPhotos.objectKey })
      .from(mealPhotos)
      .innerJoin(meals, eq(meals.id, mealPhotos.mealId))
      .where(and(eq(meals.id, mealId), eq(meals.userId, userId)))
      .orderBy(asc(mealPhotos.createdAt));
    const rows = await tx
      .delete(meals)
      .where(and(eq(meals.id, mealId), eq(meals.userId, userId)))
      .returning({ id: meals.id });
    return rows.length > 0
      ? { photoKeys: photos.map((p) => p.objectKey) }
      : null;
  });
}

export async function addMealPhoto(
  db: Db,
  mealId: string,
  objectKey: string,
  now: Date,
): Promise<void> {
  await db.insert(mealPhotos).values({
    mealId,
    objectKey,
    createdAt: now,
    expiresAt: new Date(
      now.getTime() + MEAL_PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ),
  });
}

/** Newest photo key of the user's meal; null when none or not owner. */
export async function mealPhotoKey(
  db: Db,
  userId: string,
  mealId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ objectKey: mealPhotos.objectKey })
    .from(mealPhotos)
    .innerJoin(meals, eq(meals.id, mealPhotos.mealId))
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId)))
    .orderBy(desc(mealPhotos.createdAt))
    .limit(1);
  return row?.objectKey ?? null;
}

export interface DraftItem extends Nutrition {
  name: string;
  grams: number;
  aiConfidence: number;
}

/** Stores an unconfirmed meal of AI-estimated items (no food link). */
export async function createDraftMeal(
  db: Db,
  userId: string,
  input: { eatenOn: string; mealType: MealType; items: DraftItem[] },
  source: "text" | "photo",
  now: Date,
): Promise<Meal> {
  if (input.items.length === 0) throw new MealInputError("empty");
  if (input.items.length > MAX_MEAL_ITEMS) throw new MealInputError("too_many");
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(meals)
      .values({
        userId,
        eatenOn: input.eatenOn,
        mealType: input.mealType,
        status: "draft",
        source,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const row = one(inserted[0]);
    await tx.insert(mealItems).values(
      itemValues(
        row.id,
        input.items.map((i) => ({ ...i, foodId: null })),
      ),
    );
    return loadMeal(tx, row);
  });
}

/** Confirms a meal; an already confirmed meal keeps its confirmed_at. */
export async function confirmMeal(
  db: Db,
  userId: string,
  mealId: string,
  now: Date,
): Promise<Meal | null> {
  const [row] = await db
    .update(meals)
    .set({
      status: "confirmed",
      confirmedAt: sql`coalesce(${meals.confirmedAt}, ${now.toISOString()}::timestamptz)`,
      updatedAt: sql`case when ${meals.status} = 'confirmed' then ${meals.updatedAt} else ${now.toISOString()}::timestamptz end`,
    })
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId)))
    .returning();
  return row ? loadMeal(db, row) : null;
}

export async function setMealType(
  db: Db,
  userId: string,
  mealId: string,
  mealType: MealType,
  now: Date,
): Promise<Meal | null> {
  const [row] = await db
    .update(meals)
    .set({ mealType, updatedAt: now })
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId)))
    .returning();
  return row ? loadMeal(db, row) : null;
}
