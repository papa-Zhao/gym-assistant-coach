import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { mealPhotos, users } from "../src/db/schema";
import {
  addMealPhoto,
  createDraftMeal,
  deleteMeal,
  getMeal,
  mealPhotoKey,
} from "../src/meals/repo";
import { syncUser } from "../src/users/repo";
import { createTestDb } from "./db";

const NOW = new Date("2026-10-22T04:00:00Z");

describe("meal photos repo", () => {
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
    const draft = (uid: string) =>
      createDraftMeal(
        t.db,
        uid,
        {
          eatenOn: "2026-10-22",
          mealType: "lunch",
          items: [
            {
              name: "飯",
              grams: 100,
              kcal: 130,
              proteinG: 2,
              carbG: 28,
              fatG: 0,
              aiConfidence: 0.8,
            },
          ],
        },
        "photo",
        NOW,
      );
    return { ...t, userId, otherId, draft };
  }

  it("stores a photo and returns its key to the owner only", async () => {
    const { db, userId, otherId, draft } = await setup();
    const meal = await draft(userId);
    await addMealPhoto(db, meal.id, "meals/u/a.jpg", NOW);
    expect(await mealPhotoKey(db, userId, meal.id)).toBe("meals/u/a.jpg");
    expect(await mealPhotoKey(db, otherId, meal.id)).toBeNull();
    const [row] = await db.select().from(mealPhotos);
    expect(row?.expiresAt.toISOString()).toBe("2027-01-20T04:00:00.000Z");
  });

  it("returns the newest key when a meal has several", async () => {
    const { db, userId, draft } = await setup();
    const meal = await draft(userId);
    await addMealPhoto(db, meal.id, "k/old.jpg", NOW);
    await addMealPhoto(
      db,
      meal.id,
      "k/new.jpg",
      new Date(NOW.getTime() + 1000),
    );
    expect(await mealPhotoKey(db, userId, meal.id)).toBe("k/new.jpg");
  });

  it("deleteMeal returns photo keys and removes the rows", async () => {
    const { db, userId, draft } = await setup();
    const meal = await draft(userId);
    await addMealPhoto(db, meal.id, "k/a.jpg", NOW);
    expect(await deleteMeal(db, userId, meal.id)).toEqual({
      photoKeys: ["k/a.jpg"],
    });
    expect(await db.select().from(mealPhotos)).toEqual([]);
  });

  it("deleteMeal on a meal without photos returns empty keys", async () => {
    const { db, userId, draft } = await setup();
    const meal = await draft(userId);
    expect(await deleteMeal(db, userId, meal.id)).toEqual({ photoKeys: [] });
  });

  it("deleteMeal refuses other users and leaves data", async () => {
    const { db, userId, otherId, draft } = await setup();
    const meal = await draft(userId);
    await addMealPhoto(db, meal.id, "k/a.jpg", NOW);
    expect(await deleteMeal(db, otherId, meal.id)).toBeNull();
    expect(await getMeal(db, userId, meal.id)).not.toBeNull();
    expect(await db.select().from(mealPhotos)).toHaveLength(1);
  });

  it("deleting the user cascades to photos", async () => {
    const { db, userId, draft } = await setup();
    const meal = await draft(userId);
    await addMealPhoto(db, meal.id, "k/a.jpg", NOW);
    await db.delete(users).where(eq(users.id, userId));
    expect(await db.select().from(mealPhotos)).toEqual([]);
  });
});
