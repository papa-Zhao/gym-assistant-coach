import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { CONSENT_VERSION } from "@gac/shared";
import { saveProfile } from "../src/profile/repo";
import { findByLineUserId, syncUser, type Db } from "../src/users/repo";
import {
  finishSession,
  listExercises,
  startSession,
  upsertCardio,
  upsertSet,
} from "../src/workouts/repo";
import { foods } from "../src/db/schema";
import { createMeal } from "../src/meals/repo";
import { formatWorkoutSummary } from "../src/workouts/summary";
import { createTestDb } from "./db";

const BOT = "bot-runtime@x.iam.gserviceaccount.com";
const LINE_ID = `U${"a".repeat(32)}`;
let nowIso = "2026-10-19T04:00:00Z";
const auth = { authorization: "Bearer good" };

describe("/internal/users", () => {
  let app: ReturnType<typeof buildApp>;
  let db: Db;
  let closeDb: () => Promise<void>;

  beforeAll(async () => {
    const t = await createTestDb();
    db = t.db;
    closeDb = t.close;
    const deps: AppDeps = {
      db,
      verifyServiceToken: async (token) => {
        if (token === "good") return { email: BOT };
        if (token === "other")
          return { email: "other@x.iam.gserviceaccount.com" };
        throw new Error("invalid token");
      },
      botServiceAccount: BOT,
      verifyLineIdToken: async () => ({ sub: LINE_ID, name: null }),
      notifyWorkoutFinished: async () => {},
      sessionSecret: new Uint8Array(32),
      corsOrigin: "http://localhost",
      now: () => new Date(nowIso),
    };
    app = buildApp(deps);
  });
  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  const post = (
    url: string,
    payload: unknown,
    headers: Record<string, string> = auth,
  ) => app.inject({ method: "POST", url, payload: payload as object, headers });

  it("rejects missing token with 401", async () => {
    const res = await post("/internal/users/sync", { lineUserId: LINE_ID }, {});
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects a valid token from another service account with 401", async () => {
    const res = await post(
      "/internal/users/sync",
      { lineUserId: LINE_ID },
      { authorization: "Bearer other" },
    );
    expect(res.statusCode).toBe(401);
  });

  it("unauthenticated malformed body gets 401", async () => {
    const res = await post("/internal/users/sync", { lineUserId: "nope" }, {});
    expect(res.statusCode).toBe(401);
  });

  it("rejects an invalid token with 401", async () => {
    const res = await post(
      "/internal/users/sync",
      { lineUserId: LINE_ID },
      { authorization: "Bearer bad" },
    );
    expect(res.statusCode).toBe(401);
  });

  it("sync returns consented false then true after consent", async () => {
    const id = `U${"b".repeat(32)}`;
    const first = await post("/internal/users/sync", {
      lineUserId: id,
      displayName: "小明",
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().consented).toBe(false);
    const consent = await post("/internal/users/consent", {
      lineUserId: id,
      version: CONSENT_VERSION,
    });
    expect(consent.statusCode).toBe(204);
    const second = await post("/internal/users/sync", { lineUserId: id });
    expect(second.json()).toEqual({
      userId: first.json().userId,
      consented: true,
    });
  });

  it("consent for an unseen user creates and records", async () => {
    const id = `U${"c".repeat(32)}`;
    const consent = await post("/internal/users/consent", {
      lineUserId: id,
      version: CONSENT_VERSION,
    });
    expect(consent.statusCode).toBe(204);
    const sync = await post("/internal/users/sync", { lineUserId: id });
    expect(sync.json().consented).toBe(true);
  });

  it("rejects malformed lineUserId with 400", async () => {
    for (const url of ["sync", "consent", "unfollow"]) {
      const res = await post(`/internal/users/${url}`, {
        lineUserId: "nope",
        version: CONSENT_VERSION,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "bad_request" });
    }
  });

  it("unfollow returns 204 and marks user", async () => {
    const id = `U${"d".repeat(32)}`;
    await post("/internal/users/sync", { lineUserId: id });
    const res = await post("/internal/users/unfollow", { lineUserId: id });
    expect(res.statusCode).toBe(204);
    expect((await findByLineUserId(db, id))?.status).toBe("unfollowed");
  });

  it("today without profile returns hasProfile false", async () => {
    const res = await post("/internal/users/today", {
      lineUserId: `U${"e".repeat(32)}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      hasProfile: false,
      date: "2026-10-19",
      targets: null,
      consumed: { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
      workoutSummary: null,
      weightKg: null,
      streakDays: 0,
    });
  });

  it("today with profile returns targets and zero consumed", async () => {
    const id = `U${"f".repeat(32)}`;
    const { userId } = (
      await post("/internal/users/sync", { lineUserId: id })
    ).json();
    await saveProfile(
      db,
      userId,
      {
        sex: "male",
        birthYear: 1990,
        heightCm: 175,
        weightKg: 70,
        activityLevel: "moderate",
        goal: "maintain",
      },
      "2026-10-19",
    );
    const body = (
      await post("/internal/users/today", { lineUserId: id })
    ).json();
    expect(body.hasProfile).toBe(true);
    expect(body.weightKg).toBe(70);
    expect(body.targets.kcal).toBeGreaterThan(0);
    expect(body.consumed).toEqual({ kcal: 0, proteinG: 0, carbG: 0, fatG: 0 });
    expect(body.workoutSummary).toBeNull();
    expect(body.streakDays).toBe(0);
  });

  it("today consumed reflects today's meals", async () => {
    const id = `U${"9".repeat(32)}`;
    const { userId } = await syncUser(db, id, null);
    const [food] = await db.select().from(foods).limit(1);
    if (!food) throw new Error("no seed food");
    const meal = await createMeal(
      db,
      userId,
      {
        eatenOn: "2026-10-19",
        mealType: "lunch",
        items: [{ foodId: food.id, grams: 200 }],
      },
      "manual",
      new Date(nowIso),
    );
    expect(meal.total.kcal).toBeGreaterThan(0);
    const body = (
      await post("/internal/users/today", { lineUserId: id })
    ).json();
    expect(body.consumed.kcal).toBe(meal.total.kcal);
  });

  it("today consumed switches day at Taipei midnight", async () => {
    const id = `U${"8".repeat(32)}`;
    const { userId } = await syncUser(db, id, null);
    const [food] = await db.select().from(foods).limit(1);
    if (!food) throw new Error("no seed food");
    const log = (eatenOn: string) =>
      createMeal(
        db,
        userId,
        {
          eatenOn,
          mealType: "dinner",
          items: [{ foodId: food.id, grams: 200 }],
        },
        "manual",
        new Date(nowIso),
      );
    const oct21 = await log("2026-10-21");
    const oct22 = await log("2026-10-22");
    expect(oct21.total.kcal).toBeGreaterThan(0);
    try {
      nowIso = "2026-10-21T15:59:59Z";
      const before = (
        await post("/internal/users/today", { lineUserId: id })
      ).json();
      expect(before.date).toBe("2026-10-21");
      expect(before.consumed.kcal).toBe(oct21.total.kcal);
      nowIso = "2026-10-21T16:00:00Z";
      const after = (
        await post("/internal/users/today", { lineUserId: id })
      ).json();
      expect(after.date).toBe("2026-10-22");
      expect(after.consumed.kcal).toBe(oct22.total.kcal);
    } finally {
      nowIso = "2026-10-19T04:00:00Z";
    }
  });

  it("today uses Taipei date", async () => {
    nowIso = "2026-10-18T16:30:00Z";
    try {
      const res = await post("/internal/users/today", { lineUserId: LINE_ID });
      expect(res.json().date).toBe("2026-10-19");
    } finally {
      nowIso = "2026-10-19T04:00:00Z";
    }
  });

  it("today summary shows workout after finish", async () => {
    const id = `U${"f".repeat(32)}`;
    const { userId } = await syncUser(db, id, null);
    const today = () => post("/internal/users/today", { lineUserId: id });
    expect((await today()).json().workoutSummary).toBeNull();
    const all = await listExercises(db, userId);
    const bench = all.find((e) => e.slug === "barbell-bench-press");
    const run = all.find((e) => e.kind === "cardio");
    if (!bench || !run) throw new Error("missing seed");
    const s = await startSession(db, userId, "2026-10-19");
    await upsertSet(db, userId, s.id, bench.id, {
      setIndex: 1,
      weightKg: 100,
      reps: 10,
    });
    await upsertSet(db, userId, s.id, bench.id, {
      setIndex: 2,
      weightKg: 100,
      reps: 10,
    });
    await upsertCardio(db, userId, s.id, run.id, {
      entryIndex: 1,
      durationMin: 20,
    });
    // still in progress: not shown
    expect((await today()).json().workoutSummary).toBeNull();
    await finishSession(db, userId, s.id);
    expect((await today()).json().workoutSummary).toBe(
      "訓練・2 個動作・2,000 kg・有氧 20 分鐘",
    );
  });

  it("formats workout summaries", () => {
    const base = {
      sessions: 1,
      templateName: "推日",
      exerciseCount: 4,
      setCount: 12,
      volumeKg: 9840,
      cardioMinutes: 0,
    };
    expect(formatWorkoutSummary(base)).toBe("推日・4 個動作・9,840 kg");
    expect(formatWorkoutSummary({ ...base, cardioMinutes: 15 })).toBe(
      "推日・4 個動作・9,840 kg・有氧 15 分鐘",
    );
    expect(
      formatWorkoutSummary({
        ...base,
        templateName: null,
        exerciseCount: 1,
        setCount: 0,
        volumeKg: 0,
        cardioMinutes: 30,
      }),
    ).toBe("訓練・1 個動作・有氧 30 分鐘");
  });

  it("GET /health still works without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });
});
