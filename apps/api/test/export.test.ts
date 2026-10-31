import { CONSENT_VERSION, type DataExport } from "@gac/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { issueSession } from "../src/auth/session";
import { createProgram } from "../src/ask/programs";
import {
  aiConversations,
  aiMessages,
  aiUsageDaily,
  bodyMetrics,
  exercises,
  foods,
  mealItems,
  mealPhotos,
  meals,
  templateItems,
  workoutSessions,
  workoutSets,
  workoutTemplates,
} from "../src/db/schema";
import { exportUserData } from "../src/users/export";
import { recordConsent, syncUser, type Db } from "../src/users/repo";
import {
  createTestDb,
  unusedAdvisor,
  unusedEquipmentIdentifier,
  unusedMealParser,
  unusedPhotoStore,
} from "./db";

const NOW = new Date("2026-10-22T04:00:00Z");
const SECRET = new Uint8Array(32).fill(7);
const LINE_A = `U${"a".repeat(32)}`;
const LINE_B = `U${"b".repeat(32)}`;

function must<T>(v: T | undefined): T {
  if (v === undefined) throw new Error("expected a value");
  return v;
}

/** One of everything for `userId`; returns the ids it created. */
async function seed(db: Db, userId: string, tag: string) {
  const [bench] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.slug, "barbell-bench-press"));
  const benchId = must(bench).id;
  await db.insert(bodyMetrics).values({
    userId,
    measuredOn: "2026-10-20",
    weightKg: "70.5",
  });
  const [custom] = await db
    .insert(exercises)
    .values({
      nameZh: `自訂動作${tag}`,
      kind: "strength",
      muscleGroup: "chest",
      equipment: "selectorized_machine",
      isCustom: true,
      ownerUserId: userId,
      photoThumb: Buffer.from("thumb-bytes"),
    })
    .returning({ id: exercises.id });
  const [template] = await db
    .insert(workoutTemplates)
    .values({ userId, name: `範本${tag}` })
    .returning({ id: workoutTemplates.id });
  await db.insert(templateItems).values({
    templateId: must(template).id,
    exerciseId: must(custom).id,
    position: 0,
    sets: 3,
    reps: 10,
  });
  const [session] = await db
    .insert(workoutSessions)
    .values({ userId, performedOn: "2026-10-21", endedAt: NOW })
    .returning({ id: workoutSessions.id });
  await db.insert(workoutSets).values({
    sessionId: must(session).id,
    exerciseId: benchId,
    setIndex: 1,
    reps: 8,
    weightKg: "60",
  });
  const [food] = await db
    .insert(foods)
    .values({
      source: "custom",
      name: `自訂食物${tag}`,
      kcalPer100g: "100",
      ownerUserId: userId,
    })
    .returning({ id: foods.id });
  const [meal] = await db
    .insert(meals)
    .values({
      userId,
      eatenOn: "2026-10-21",
      mealType: "lunch",
      status: "confirmed",
      source: "photo",
    })
    .returning({ id: meals.id });
  await db.insert(mealItems).values({
    mealId: must(meal).id,
    position: 0,
    foodId: must(food).id,
    name: `品項${tag}`,
    grams: "150",
    kcal: 150,
    proteinG: "10",
    carbG: "20",
    fatG: "3",
  });
  await db.insert(mealPhotos).values({
    mealId: must(meal).id,
    objectKey: `meals/${userId}/photo.jpg`,
    expiresAt: NOW,
  });
  const [conv] = await db
    .insert(aiConversations)
    .values({ userId })
    .returning({ id: aiConversations.id });
  await db.insert(aiMessages).values([
    { conversationId: must(conv).id, role: "user", content: `問題${tag}` },
    { conversationId: must(conv).id, role: "assistant", content: `回答${tag}` },
  ]);
  const programId = await createProgram(
    db,
    userId,
    [
      {
        name: `第一天${tag}`,
        items: [{ exerciseId: benchId, sets: 3, reps: 8 }],
      },
    ],
    NOW,
  );
  await db
    .insert(aiUsageDaily)
    .values({ userId, day: "2026-10-21", kind: "chat", count: 2 });
  return {
    customId: must(custom).id,
    templateId: must(template).id,
    sessionId: must(session).id,
    foodId: must(food).id,
    mealId: must(meal).id,
    conversationId: must(conv).id,
    programId,
  };
}

describe("exportUserData", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function setup() {
    const t = await createTestDb();
    close = t.close;
    const a = (await syncUser(t.db, LINE_A, "Amy")).userId;
    const b = (await syncUser(t.db, LINE_B, "Bob")).userId;
    await recordConsent(t.db, LINE_A, CONSENT_VERSION);
    await recordConsent(t.db, LINE_B, CONSENT_VERSION);
    const seededA = await seed(t.db, a, "A");
    const seededB = await seed(t.db, b, "B");
    return { db: t.db, a, b, seededA, seededB };
  }

  it("contains only the user's own records, with names", async () => {
    const { db, a } = await setup();
    const out = await exportUserData(db, a, NOW);
    expect(out.exportedAt).toBe(NOW.toISOString());
    expect(out.account.displayName).toBe("Amy");
    expect(out.consents.length).toBeGreaterThan(0);
    expect(out.consents[0]).toMatchObject({ version: CONSENT_VERSION });
    expect(out.bodyMetrics).toEqual([
      expect.objectContaining({ measuredOn: "2026-10-20", weightKg: 70.5 }),
    ]);
    expect(out.workoutSessions).toHaveLength(1);
    expect(out.workoutSessions[0]).toMatchObject({
      performedOn: "2026-10-21",
      sets: [expect.objectContaining({ exercise: "槓鈴臥推", reps: 8 })],
    });
    expect(out.workoutTemplates).toEqual([
      expect.objectContaining({
        name: "範本A",
        items: [expect.objectContaining({ exercise: "自訂動作A", sets: 3 })],
      }),
    ]);
    expect(out.customExercises).toEqual([
      expect.objectContaining({ nameZh: "自訂動作A" }),
    ]);
    expect(out.meals).toEqual([
      expect.objectContaining({
        mealType: "lunch",
        items: [expect.objectContaining({ name: "品項A", food: "自訂食物A" })],
      }),
    ]);
    expect(out.customFoods).toEqual([
      expect.objectContaining({ name: "自訂食物A" }),
    ]);
    expect(out.aiConversations).toEqual([
      expect.objectContaining({
        messages: [
          expect.objectContaining({ role: "user", content: "問題A" }),
          expect.objectContaining({ role: "assistant", content: "回答A" }),
        ],
      }),
    ]);
    expect(out.aiPrograms).toEqual([
      expect.objectContaining({
        days: [
          {
            name: "第一天A",
            items: [{ exercise: "槓鈴臥推", sets: 3, reps: 8 }],
          },
        ],
      }),
    ]);
    expect(out.aiUsage).toEqual([
      { day: "2026-10-21", kind: "chat", count: 2 },
    ]);
  });

  it("leaks no LINE id, photo key or other user's ids", async () => {
    const { db, a, b, seededB } = await setup();
    const json = JSON.stringify(await exportUserData(db, a, NOW));
    expect(json).not.toContain(LINE_A);
    expect(json).not.toContain("meals/");
    expect(json).not.toContain(b);
    for (const id of Object.values(seededB)) expect(json).not.toContain(id);
    expect(json).not.toContain("Bob");
    expect(json).not.toMatch(/[一-鿿]B"/);
  });

  it("export does not include photo bytes", async () => {
    const { db, a } = await setup();
    const json = JSON.stringify(await exportUserData(db, a, NOW));
    // meals legitimately carry source: "photo"; only thumbnail fields matter.
    for (const bad of ["photoUrl", "photoThumb", "photo_thumb", "data:image"])
      expect(json).not.toContain(bad);
    expect(json).not.toContain(Buffer.from("thumb-bytes").toString("base64"));
  });

  it("a new user gets a null profile and empty lists", async () => {
    const t = await createTestDb();
    close = t.close;
    const { userId } = await syncUser(t.db, LINE_A, null);
    const out = await exportUserData(t.db, userId, NOW);
    expect(out.profile).toBeNull();
    expect(out.account.displayName).toBeNull();
    for (const key of [
      "consents",
      "bodyMetrics",
      "workoutSessions",
      "workoutTemplates",
      "customExercises",
      "meals",
      "customFoods",
      "aiConversations",
      "aiPrograms",
      "aiUsage",
    ] as const) {
      expect(out[key], key).toEqual([]);
    }
  });
});

describe("GET /me/export", () => {
  it("returns the export, then 401 after deletion", async () => {
    const t = await createTestDb();
    const { userId } = await syncUser(t.db, LINE_A, "Amy");
    await recordConsent(t.db, LINE_A, CONSENT_VERSION);
    const deps: AppDeps = {
      db: t.db,
      verifyServiceToken: async () => {
        throw new Error("unused");
      },
      botServiceAccount: "bot@x",
      schedulerServiceAccount: "scheduler@x",
      verifyLineIdToken: async () => {
        throw new Error("unused");
      },
      notifyWorkoutFinished: async () => {},
      mealParser: unusedMealParser,
      equipmentIdentifier: unusedEquipmentIdentifier,
      advisor: unusedAdvisor,
      photoStore: unusedPhotoStore,
      sessionSecret: SECRET,
      corsOrigin: "https://liff.example",
      now: () => NOW,
    };
    const app = buildApp(deps);
    try {
      const token = await issueSession(SECRET, userId);
      const headers = { authorization: `Bearer ${token}` };
      const res = await app.inject({
        method: "GET",
        url: "/me/export",
        headers,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as DataExport;
      expect(body.account.displayName).toBe("Amy");
      expect(body.exportedAt).toBe(NOW.toISOString());
      await app.inject({ method: "DELETE", url: "/me", headers });
      const after = await app.inject({
        method: "GET",
        url: "/me/export",
        headers,
      });
      expect(after.statusCode).toBe(401);
      const none = await app.inject({ method: "GET", url: "/me/export" });
      expect(none.statusCode).toBe(401);
    } finally {
      await app.close();
      await t.close();
    }
  });
});
