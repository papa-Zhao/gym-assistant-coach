import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Advisor, RawProgramDay } from "../src/ai/advisor.js";
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
import { MealParserUnavailable, type MealParser } from "../src/ai/meal-parser";
import { meals } from "../src/db/schema";
import { eq } from "drizzle-orm";
import {
  createTestDb,
  memoryPhotoStore,
  unusedEquipmentIdentifier,
  unusedWorkoutAdvisor,
} from "./db";
import sharp from "sharp";
import { MEAL_PHOTO_MAX_BYTES } from "@gac/shared";

const BOT = "bot-runtime@x.iam.gserviceaccount.com";
const LINE_ID = `U${"a".repeat(32)}`;
let nowIso = "2026-10-19T04:00:00Z";
let parser: MealParser = {
  parseText: async () => ({
    kind: "items",
    items: [
      {
        name: "雞腿便當",
        grams: 450,
        kcal: 800,
        proteinG: 35,
        carbG: 90,
        fatG: 30,
        confidence: 0.7,
      },
    ],
    usage: { input: 1, output: 1, cacheRead: 0, cacheCreation: 0 },
  }),
  parsePhoto: async () => {
    photoCalls += 1;
    return parser.parseText("");
  },
};
const auth = { authorization: "Bearer good" };
const photos = memoryPhotoStore();
let photoCalls = 0;
let askProgram: RawProgramDay[] = [];
const askCalls: Parameters<Advisor["ask"]>[0][] = [];

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
      schedulerServiceAccount: "scheduler@x",
      verifyLineIdToken: async () => ({ sub: LINE_ID, name: null }),
      notifyWorkoutFinished: async () => {},
      mealParser: {
        parseText: (text) => parser.parseText(text),
        parsePhoto: (jpeg) => parser.parsePhoto(jpeg),
      },
      equipmentIdentifier: unusedEquipmentIdentifier,
      workoutAdvisor: unusedWorkoutAdvisor,
      advisor: {
        ask: async (input) => {
          askCalls.push(input);
          return {
            kind: "ok",
            advice: {
              title: "建議",
              items: [],
              body: "多喝水。",
              program: askProgram,
            },
            usage: { input: 1, output: 1, cacheRead: 0, cacheCreation: 0 },
          };
        },
      },
      photoStore: photos.store,
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

  describe("meal text", () => {
    const ME = `U${"1".repeat(32)}`;
    const OTHER = `U${"2".repeat(32)}`;
    const text = (lineUserId: string, t = "午餐 雞腿便當") =>
      post("/internal/meals/text", { lineUserId, mealType: "lunch", text: t });

    it("returns a draft that counts toward today", async () => {
      await syncUser(db, ME, null);
      const res = await text(ME);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.outcome).toBe("draft");
      expect(body.meal).toMatchObject({ status: "draft", source: "text" });
      const today = (
        await post("/internal/users/today", { lineUserId: ME })
      ).json();
      expect(today.consumed.kcal).toBe(800);
    });

    it("404s for an unknown user", async () => {
      const res = await text(`U${"3".repeat(32)}`);
      expect(res.statusCode).toBe(404);
    });

    it("maps parser outcomes", async () => {
      const id = `U${"4".repeat(32)}`;
      await syncUser(db, id, null);
      const saved = parser;
      try {
        parser = {
          parseText: async () => ({
            kind: "refused",
            usage: { input: 1, output: 1, cacheRead: 0, cacheCreation: 0 },
          }),
          parsePhoto: async () => {
            throw new Error("unused");
          },
        };
        expect((await text(id)).json()).toEqual({ outcome: "refused" });
        parser = {
          parseText: async () => {
            throw new MealParserUnavailable("down");
          },
          parsePhoto: async () => {
            throw new Error("unused");
          },
        };
        expect((await text(id)).json()).toEqual({ outcome: "unavailable" });
      } finally {
        parser = saved;
      }
    });

    it("rejects bad bodies with 400", async () => {
      expect((await text(ME, "")).statusCode).toBe(400);
      expect((await text(ME, "x".repeat(201))).statusCode).toBe(400);
      expect((await text(ME, "x".repeat(200))).statusCode).toBe(200);
      const badType = await post("/internal/meals/text", {
        lineUserId: ME,
        mealType: "brunch",
        text: "a",
      });
      expect(badType.statusCode).toBe(400);
    });

    it("confirms idempotently and returns today", async () => {
      const id = `U${"5".repeat(32)}`;
      await syncUser(db, id, null);
      const draft = (await text(id)).json().meal;
      const first = await post(`/internal/meals/${draft.id}/confirm`, {
        lineUserId: id,
      });
      expect(first.statusCode).toBe(200);
      const a = first.json();
      expect(a.meal.status).toBe("confirmed");
      expect(a.today).toEqual({
        date: "2026-10-19",
        consumed: { kcal: 800, proteinG: 35, carbG: 90, fatG: 30 },
        targets: null,
      });
      const [row1] = await db
        .select()
        .from(meals)
        .where(eq(meals.id, draft.id));
      nowIso = "2026-10-19T05:00:00Z";
      try {
        const second = await post(`/internal/meals/${draft.id}/confirm`, {
          lineUserId: id,
        });
        expect(second.json()).toEqual(a);
      } finally {
        nowIso = "2026-10-19T04:00:00Z";
      }
      const [row2] = await db
        .select()
        .from(meals)
        .where(eq(meals.id, draft.id));
      expect(row2?.confirmedAt).toEqual(row1?.confirmedAt);
      expect(row2?.confirmedAt).not.toBeNull();
    });

    it("404s and changes nothing for another user's meal", async () => {
      await syncUser(db, OTHER, null);
      const draft = (await text(ME)).json().meal;
      const confirm = await post(`/internal/meals/${draft.id}/confirm`, {
        lineUserId: OTHER,
      });
      expect(confirm.statusCode).toBe(404);
      const type = await post(`/internal/meals/${draft.id}/type`, {
        lineUserId: OTHER,
        mealType: "dinner",
      });
      expect(type.statusCode).toBe(404);
      const [row] = await db.select().from(meals).where(eq(meals.id, draft.id));
      expect(row).toMatchObject({ status: "draft", mealType: "lunch" });
    });

    it("changes the meal type", async () => {
      const draft = (await text(ME)).json().meal;
      const res = await post(`/internal/meals/${draft.id}/type`, {
        lineUserId: ME,
        mealType: "dinner",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().meal).toMatchObject({
        id: draft.id,
        mealType: "dinner",
      });
    });

    it("400s on a non-uuid id and 404s on an unknown one", async () => {
      const bad = await post("/internal/meals/nope/confirm", {
        lineUserId: ME,
      });
      expect(bad.statusCode).toBe(400);
      const badType = await post("/internal/meals/nope/type", {
        lineUserId: ME,
        mealType: "lunch",
      });
      expect(badType.statusCode).toBe(400);
      const missing = await post(
        "/internal/meals/00000000-0000-4000-8000-000000000000/confirm",
        { lineUserId: ME },
      );
      expect(missing.statusCode).toBe(404);
    });
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

  describe("meal photo", () => {
    const ME = `U${"6".repeat(32)}`;
    const photo = (
      lineUserId: string | undefined,
      payload: Buffer,
      type = "application/octet-stream",
    ) =>
      app.inject({
        method: "POST",
        url: "/internal/meals/photo",
        payload,
        headers: {
          ...auth,
          "content-type": type,
          ...(lineUserId ? { "x-line-user-id": lineUserId } : {}),
        },
      });
    const jpeg = () =>
      sharp({
        create: {
          width: 20,
          height: 20,
          channels: 3,
          background: { r: 1, g: 2, b: 3 },
        },
      })
        .jpeg()
        .toBuffer();

    it("returns a draft that confirms normally", async () => {
      await syncUser(db, ME, null);
      const res = await photo(ME, await jpeg());
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.outcome).toBe("draft");
      expect(body.meal).toMatchObject({ status: "draft", source: "photo" });
      const confirm = await post(`/internal/meals/${body.meal.id}/confirm`, {
        lineUserId: ME,
      });
      expect(confirm.statusCode).toBe(200);
      expect(confirm.json().meal.status).toBe("confirmed");
    });

    it("maps an unreadable image to invalid_image", async () => {
      const res = await photo(ME, Buffer.from("nope"));
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ outcome: "invalid_image" });
    });

    it("400s on a missing or malformed header", async () => {
      expect((await photo(undefined, await jpeg())).statusCode).toBe(400);
      expect((await photo("U123", await jpeg())).statusCode).toBe(400);
    });

    it("404s for an unknown user", async () => {
      expect((await photo(`U${"7".repeat(32)}`, await jpeg())).statusCode).toBe(
        404,
      );
    });

    it("413s over the size limit without calling the parser", async () => {
      const before = photoCalls;
      const res = await photo(ME, Buffer.alloc(MEAL_PHOTO_MAX_BYTES + 1));
      expect(res.statusCode).toBe(413);
      expect(res.json()).toEqual({ error: "payload_too_large" });
      expect(photoCalls).toBe(before);
    });

    it("415s a JSON body", async () => {
      const res = await photo(ME, Buffer.from("{}"), "application/json");
      expect(res.statusCode).toBe(415);
      expect(res.json()).toEqual({ error: "unsupported_media_type" });
    });
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

  it("ask requires the bot token", async () => {
    const res = await post(
      "/internal/ai/ask",
      { lineUserId: LINE_ID, text: "嗨" },
      {},
    );
    expect(res.statusCode).toBe(401);
  });

  it("ask rejects empty and over-long text with 400", async () => {
    for (const text of ["", "字".repeat(501)]) {
      const res = await post("/internal/ai/ask", { lineUserId: LINE_ID, text });
      expect(res.statusCode).toBe(400);
    }
  });

  it("ask and reset return 404 for an unknown user", async () => {
    const unknown = `U${"0123456789abcdef".repeat(2)}`;
    const ask = await post("/internal/ai/ask", {
      lineUserId: unknown,
      text: "嗨",
    });
    expect(ask.statusCode).toBe(404);
    expect(ask.json()).toEqual({ error: "not_found" });
    const reset = await post("/internal/ai/reset", { lineUserId: unknown });
    expect(reset.statusCode).toBe(404);
  });

  it("ask answers, and reset clears the history", async () => {
    const id = `U${"c".repeat(32)}`;
    await syncUser(db, id, null);
    askCalls.length = 0;
    const first = await post("/internal/ai/ask", {
      lineUserId: id,
      text: "晚餐？",
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().outcome).toBe("answer");
    await post("/internal/ai/ask", { lineUserId: id, text: "宵夜？" });
    expect(askCalls[1]?.history).toHaveLength(2);
    const reset = await post("/internal/ai/reset", { lineUserId: id });
    expect(reset.statusCode).toBe(204);
    await post("/internal/ai/ask", { lineUserId: id, text: "早餐？" });
    expect(askCalls[2]?.history).toEqual([]);
  });

  it("ask returns a program and program-save saves a day once", async () => {
    const id = `U${"d".repeat(32)}`;
    const other = `U${"e".repeat(32)}`;
    await syncUser(db, id, null);
    await syncUser(db, other, null);
    askProgram = [
      {
        name: "推日",
        exercises: [{ slug: "barbell-bench-press", sets: 4, reps: 8 }],
      },
    ];
    try {
      const res = await post("/internal/ai/ask", {
        lineUserId: id,
        text: "課表",
      });
      const program = res.json().advice.program;
      expect(program.days).toEqual([
        { name: "推日", items: [{ nameZh: "槓鈴臥推", sets: 4, reps: 8 }] },
      ]);
      const body = { lineUserId: id, programId: program.id, day: 1 };
      const first = await post("/internal/ai/program-save", body);
      expect(first.statusCode).toBe(200);
      expect(first.json()).toEqual({ outcome: "saved", templateName: "推日" });
      const second = await post("/internal/ai/program-save", body);
      expect(second.statusCode).toBe(200);
      expect(second.json().outcome).toBe("already_saved");
      for (const bad of [
        { ...body, lineUserId: `U${"0".repeat(32)}` },
        { ...body, lineUserId: other },
        { ...body, day: 7 },
        { ...body, programId: "00000000-0000-4000-8000-000000000000" },
      ]) {
        const r = await post("/internal/ai/program-save", bad);
        expect(r.statusCode).toBe(404);
      }
      for (const bad of [
        { ...body, day: 0 },
        { ...body, day: 8 },
        { ...body, programId: "x" },
      ]) {
        const r = await post("/internal/ai/program-save", bad);
        expect(r.statusCode).toBe(400);
      }
    } finally {
      askProgram = [];
    }
  });

  it("GET /health still works without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });
});
