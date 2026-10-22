import { nutritionFor } from "@gac/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { foods, mealItems, meals, users } from "../src/db/schema";
import {
  MealInputError,
  consumedOn,
  createMeal,
  deleteMeal,
  getMeal,
  listDayMeals,
  searchFoods,
  updateMeal,
} from "../src/meals/repo";
import { syncUser } from "../src/users/repo";
import { createTestDb } from "./db";

function must<T>(v: T | undefined): T {
  if (v === undefined) throw new Error("expected a value");
  return v;
}

const NOW = new Date("2026-10-22T04:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);

describe("meals repo", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function setup() {
    const t = await createTestDb();
    close = t.close;
    const { userId } = await syncUser(t.db, "U1", "Amy");
    const { userId: otherId } = await syncUser(t.db, "U2", "Bob");
    const seeded = await t.db
      .insert(foods)
      .values([
        {
          source: "custom",
          sourceRef: "t-chicken",
          name: "測試雞胸",
          kcalPer100g: "120",
          proteinPer100g: "23.5",
          carbPer100g: "0",
          fatPer100g: "2.1",
        },
        {
          source: "custom",
          sourceRef: "t-null",
          name: "測試無蛋白",
          kcalPer100g: "50",
        },
        {
          source: "custom",
          sourceRef: "t-rice",
          name: "測試飯",
          kcalPer100g: "180",
          proteinPer100g: "3",
          carbPer100g: "40",
          fatPer100g: "0.5",
        },
      ])
      .returning();
    const chicken = must(seeded[0]);
    const nullMacro = must(seeded[1]);
    const rice = must(seeded[2]);
    return { db: t.db, userId, otherId, chicken, nullMacro, rice };
  }

  const per100 = (f: { kcalPer100g: string }) => ({
    kcal: Number(f.kcalPer100g),
    proteinG: 23.5,
    carbG: 0,
    fatG: 2.1,
  });

  describe("searchFoods", () => {
    it("finds foods by alias", async () => {
      const { db } = await setup();
      const r = await searchFoods(db, "高麗菜");
      expect(r.length).toBeGreaterThan(0);
      expect(r.some((f) => f.aliases?.includes("高麗菜"))).toBe(true);
    });

    it("ranks exact name first", async () => {
      const { db } = await setup();
      const r = await searchFoods(db, "白飯");
      expect(must(r[0]).name).toBe("白飯");
    });

    it("treats % as a literal", async () => {
      const { db } = await setup();
      // The seed has a few real "100%" names; every hit must contain it literally.
      for (const f of await searchFoods(db, "100%")) {
        expect(`${f.name}${f.aliases ?? ""}`).toContain("100%");
      }
      // As a wildcard "1%0" would match anything like "100".
      expect(await searchFoods(db, "1%0")).toEqual([]);
      expect(await searchFoods(db, "白_飯")).toEqual([]);
    });

    it("honours limit and blank query", async () => {
      const { db } = await setup();
      expect((await searchFoods(db, "飯", 3)).length).toBe(3);
      expect(await searchFoods(db, "  ")).toEqual([]);
    });
  });

  describe("createMeal", () => {
    it("computes nutrition from the food", async () => {
      const { db, userId, chicken } = await setup();
      const meal = await createMeal(
        db,
        userId,
        {
          eatenOn: "2026-10-22",
          mealType: "lunch",
          items: [{ foodId: chicken.id, grams: 150 }],
        },
        "manual",
        NOW,
      );
      const expected = nutritionFor(per100(chicken), 150);
      expect(meal.status).toBe("confirmed");
      expect(meal.source).toBe("manual");
      expect(meal.items).toHaveLength(1);
      expect(must(meal.items[0])).toMatchObject({
        name: "測試雞胸",
        grams: 150,
        foodId: chicken.id,
        ...expected,
      });
      expect(meal.total).toEqual(expected);
      expect(await getMeal(db, userId, meal.id)).toEqual(meal);
    });

    it("treats null protein as 0", async () => {
      const { db, userId, nullMacro } = await setup();
      const meal = await createMeal(
        db,
        userId,
        {
          eatenOn: "2026-10-22",
          mealType: "snack",
          items: [{ foodId: nullMacro.id, grams: 100 }],
        },
        "manual",
        NOW,
      );
      expect(must(meal.items[0]).proteinG).toBe(0);
      expect(must(meal.items[0]).kcal).toBe(50);
    });

    it("rejects empty, too many and unknown food", async () => {
      const { db, userId, chicken } = await setup();
      const base = { eatenOn: "2026-10-22", mealType: "lunch" as const };
      await expect(
        createMeal(db, userId, { ...base, items: [] }, "manual", NOW),
      ).rejects.toMatchObject({ code: "empty" });
      await expect(
        createMeal(
          db,
          userId,
          {
            ...base,
            items: Array.from({ length: 31 }, () => ({
              foodId: chicken.id,
              grams: 10,
            })),
          },
          "manual",
          NOW,
        ),
      ).rejects.toMatchObject({ code: "too_many" });
      await expect(
        createMeal(
          db,
          userId,
          {
            ...base,
            items: [
              { foodId: "00000000-0000-0000-0000-000000000000", grams: 10 },
            ],
          },
          "manual",
          NOW,
        ),
      ).rejects.toBeInstanceOf(MealInputError);
      await expect(
        createMeal(
          db,
          userId,
          { ...base, items: [{ id: "x", grams: 10 }] },
          "manual",
          NOW,
        ),
      ).rejects.toMatchObject({ code: "unknown_item" });
    });
  });

  describe("updateMeal", () => {
    async function twoItemMeal() {
      const s = await setup();
      const meal = await createMeal(
        s.db,
        s.userId,
        {
          eatenOn: "2026-10-22",
          mealType: "lunch",
          items: [
            { foodId: s.rice.id, grams: 180 },
            { foodId: s.chicken.id, grams: 100 },
          ],
        },
        "manual",
        NOW,
      );
      return { ...s, meal };
    }

    it("rescales an existing item", async () => {
      const { db, userId, meal } = await twoItemMeal();
      const rice = must(meal.items[0]);
      const chicken = must(meal.items[1]);
      const out = await updateMeal(
        db,
        userId,
        meal.id,
        {
          mealType: "dinner",
          items: [
            { id: rice.id, grams: 90 },
            { id: chicken.id, grams: 100 },
          ],
        },
        NOW,
      );
      expect(out!.mealType).toBe("dinner");
      expect(must(out!.items[0])).toMatchObject({
        id: rice.id,
        grams: 90,
        kcal: rice.kcal / 2,
        carbG: rice.carbG / 2,
      });
      expect(must(out!.items[1])).toEqual(chicken);
    });

    it("deletes omitted items and adds new foods", async () => {
      const { db, userId, meal, nullMacro } = await twoItemMeal();
      const out = await updateMeal(
        db,
        userId,
        meal.id,
        {
          mealType: "lunch",
          items: [
            { foodId: nullMacro.id, grams: 200 },
            { id: must(meal.items[1]).id, grams: 100 },
          ],
        },
        NOW,
      );
      expect(out!.items.map((i) => i.name)).toEqual(["測試無蛋白", "測試雞胸"]);
      expect(must(out!.items[0]).kcal).toBe(100);
      const rows = await db
        .select()
        .from(mealItems)
        .where(eq(mealItems.mealId, meal.id));
      expect(rows).toHaveLength(2);
    });

    it("confirms a draft", async () => {
      const { db, userId, meal } = await twoItemMeal();
      await db.update(meals).set({ status: "draft", confirmedAt: null });
      const out = await updateMeal(
        db,
        userId,
        meal.id,
        {
          mealType: "lunch",
          items: [{ id: must(meal.items[0]).id, grams: 180 }],
        },
        NOW,
      );
      expect(out!.status).toBe("confirmed");
      const row = must((await db.select().from(meals))[0]);
      expect(row.confirmedAt).toEqual(NOW);
    });

    it("returns null for another user's meal and changes nothing", async () => {
      const { db, userId, otherId, meal } = await twoItemMeal();
      const out = await updateMeal(
        db,
        otherId,
        meal.id,
        {
          mealType: "dinner",
          items: [{ id: must(meal.items[0]).id, grams: 10 }],
        },
        NOW,
      );
      expect(out).toBeNull();
      expect(await getMeal(db, userId, meal.id)).toEqual(meal);
    });

    it("rolls back on an item from another meal", async () => {
      const { db, userId, meal, chicken } = await twoItemMeal();
      const other = await createMeal(
        db,
        userId,
        {
          eatenOn: "2026-10-22",
          mealType: "snack",
          items: [{ foodId: chicken.id, grams: 50 }],
        },
        "manual",
        NOW,
      );
      await expect(
        updateMeal(
          db,
          userId,
          meal.id,
          {
            mealType: "dinner",
            items: [
              { id: must(meal.items[0]).id, grams: 10 },
              { id: must(other.items[0]).id, grams: 10 },
            ],
          },
          NOW,
        ),
      ).rejects.toMatchObject({ code: "unknown_item" });
      expect(await getMeal(db, userId, meal.id)).toEqual(meal);
    });
  });

  describe("day queries", () => {
    it("orders by meal type then created_at, and filters drafts by age", async () => {
      const { db, userId, chicken } = await setup();
      const mk = (
        mealType: "breakfast" | "lunch" | "dinner" | "snack",
        at: Date,
      ) =>
        createMeal(
          db,
          userId,
          {
            eatenOn: "2026-10-22",
            mealType,
            items: [{ foodId: chicken.id, grams: 100 }],
          },
          "manual",
          at,
        );
      const snack = await mk("snack", hoursAgo(5));
      const dinner = await mk("dinner", hoursAgo(4));
      const lunch2 = await mk("lunch", hoursAgo(2));
      const lunch1 = await mk("lunch", hoursAgo(3));
      const breakfast = await mk("breakfast", hoursAgo(6));
      const oldDraft = await mk("breakfast", hoursAgo(25));
      const newDraft = await mk("breakfast", hoursAgo(1));
      for (const m of [oldDraft, newDraft]) {
        await db
          .update(meals)
          .set({ status: "draft", confirmedAt: null })
          .where(eq(meals.id, m.id));
      }
      const day = await listDayMeals(db, userId, "2026-10-22", NOW);
      expect(day.meals.map((m) => m.id)).toEqual([
        oldDraft.id,
        breakfast.id,
        newDraft.id,
        lunch1.id,
        lunch2.id,
        dinner.id,
        snack.id,
      ]);
      // 6 meals counted (all but the 25h-old draft), 120 kcal each.
      expect(day.consumed.kcal).toBe(720);
      expect((await consumedOn(db, userId, "2026-10-22", NOW)).kcal).toBe(720);
    });

    it("keeps dates apart and scopes to the user", async () => {
      const { db, userId, otherId, chicken } = await setup();
      const items = [{ foodId: chicken.id, grams: 100 }];
      await createMeal(
        db,
        userId,
        { eatenOn: "2026-10-22", mealType: "lunch", items },
        "manual",
        NOW,
      );
      expect((await consumedOn(db, userId, "2026-10-21", NOW)).kcal).toBe(0);
      expect((await consumedOn(db, otherId, "2026-10-22", NOW)).kcal).toBe(0);
      expect((await listDayMeals(db, userId, "2026-10-21", NOW)).meals).toEqual(
        [],
      );
    });
  });

  describe("deleteMeal", () => {
    it("refuses other users and cascades items for the owner", async () => {
      const { db, userId, otherId, chicken } = await setup();
      const meal = await createMeal(
        db,
        userId,
        {
          eatenOn: "2026-10-22",
          mealType: "lunch",
          items: [{ foodId: chicken.id, grams: 100 }],
        },
        "manual",
        NOW,
      );
      expect(await deleteMeal(db, otherId, meal.id)).toBe(false);
      expect(await getMeal(db, userId, meal.id)).not.toBeNull();
      expect(await deleteMeal(db, userId, meal.id)).toBe(true);
      expect(await getMeal(db, userId, meal.id)).toBeNull();
      expect(await db.select().from(mealItems)).toEqual([]);
    });

    it("deleting the user removes their meals and items, keeping foods", async () => {
      const { db, userId, otherId, chicken } = await setup();
      const input = {
        eatenOn: "2026-10-22",
        mealType: "lunch" as const,
        items: [{ foodId: chicken.id, grams: 100 }],
      };
      await createMeal(db, userId, input, "manual", NOW);
      const kept = await createMeal(db, otherId, input, "manual", NOW);
      await db.delete(users).where(eq(users.id, userId));
      const left = await db.select().from(meals);
      expect(left.map((m) => m.id)).toEqual([kept.id]);
      expect(await db.select().from(mealItems)).toHaveLength(1);
      expect(
        await db.select().from(foods).where(eq(foods.id, chicken.id)),
      ).toHaveLength(1);
    });
  });
});
