import {
  AI_DAILY_LIMITS,
  EQUIPMENT_LABELS,
  MEAL_PHOTO_MAX_BYTES,
  type IdentifyEquipmentResponse,
} from "@gac/shared";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type EquipmentGuess,
  type EquipmentIdentifier,
  type IdentifyResult,
} from "../src/ai/equipment-identifier";
import { AiUnavailable } from "../src/ai/structured-call";
import { buildApp } from "../src/app.js";
import { issueSession } from "../src/auth/session";
import type { AppDeps } from "../src/deps.js";
import { aiUsageDaily } from "../src/db/schema";
import { syncUser, type Db } from "../src/users/repo";
import { identifyEquipment, shapeGuess } from "../src/workouts/identify";
import { bySlugOrder, resetBuiltinLibraryCache } from "../src/workouts/library";
import { listBuiltinExercises } from "../src/workouts/repo";
import {
  createTestDb,
  unusedAdvisor,
  unusedMealParser,
  unusedPhotoStore,
  unusedWorkoutAdvisor,
} from "./db";

const SECRET = new Uint8Array(32).fill(9);
const U1 = `U${"a".repeat(32)}`;
const NOW = new Date("2026-10-19T04:00:00Z");
const USAGE = { input: 10, output: 5, cacheRead: 2, cacheCreation: 1 };

const jpeg = () =>
  sharp({
    create: {
      width: 40,
      height: 30,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
    .jpeg()
    .toBuffer();

const guess = (over: Partial<EquipmentGuess> = {}): EquipmentGuess => ({
  isEquipment: true,
  equipment: "barbell",
  nameZh: "槓鈴臥推",
  muscleGroup: "chest",
  candidates: [],
  ...over,
});

describe("identifyEquipment and POST /exercises/identify", () => {
  let db: Db;
  let closeDb: () => Promise<void>;
  let userId: string;
  let slugs: string[];
  let app: ReturnType<typeof buildApp>;
  let headers: Record<string, string>;
  let calls: { library: number }[];
  let next: () => Promise<IdentifyResult>;

  const identifier: EquipmentIdentifier = {
    identify: async (_jpeg, library) => {
      calls.push({ library: library.length });
      seen = library;
      return next();
    },
  };
  let seen: { slug: string | null; isCustom: boolean }[] = [];
  const reply =
    (g: EquipmentGuess): (() => Promise<IdentifyResult>) =>
    async () => ({
      kind: "guess",
      guess: g,
      usage: USAGE,
    });
  const run = async (image?: Buffer) =>
    identifyEquipment(
      { db, identifier, now: () => NOW },
      userId,
      image ?? (await jpeg()),
    );
  const found = (r: IdentifyEquipmentResponse) => {
    if (r.outcome !== "found")
      throw new Error(`expected found, got ${r.outcome}`);
    return r;
  };
  const usageRow = async () =>
    (
      await db
        .select()
        .from(aiUsageDaily)
        .where(
          and(eq(aiUsageDaily.userId, userId), eq(aiUsageDaily.kind, "photo")),
        )
    )[0];

  beforeAll(async () => {
    const t = await createTestDb();
    db = t.db;
    closeDb = t.close;
    userId = (await syncUser(db, U1, null)).userId;
    slugs = (await listBuiltinExercises(db)).map((e) => e.slug as string);
    headers = { authorization: `Bearer ${await issueSession(SECRET, userId)}` };
    const deps: AppDeps = {
      db,
      verifyServiceToken: async () => {
        throw new Error("unused");
      },
      botServiceAccount: "bot@x",
      schedulerServiceAccount: "scheduler@x",
      verifyLineIdToken: async () => ({ sub: U1, name: null }),
      notifyWorkoutFinished: async () => {},
      mealParser: unusedMealParser,
      equipmentIdentifier: identifier,
      advisor: unusedAdvisor,
      workoutAdvisor: unusedWorkoutAdvisor,
      photoStore: unusedPhotoStore,
      sessionSecret: SECRET,
      corsOrigin: "http://localhost",
      now: () => NOW,
    };
    app = buildApp(deps);
  });
  afterAll(async () => {
    await app.close();
    await closeDb();
  });
  beforeEach(async () => {
    calls = [];
    resetBuiltinLibraryCache();
    await db.delete(aiUsageDaily);
    next = reply(guess());
  });

  it("returns candidates in AI order with a suggestion", async () => {
    const [a, b, c] = [slugs[5]!, slugs[2]!, slugs[9]!];
    next = reply(guess({ candidates: [a, b, c] }));
    const r = found(await run());
    expect(r.equipment).toBe("barbell");
    expect(r.candidates.map((e) => e.slug)).toEqual([a, b, c]);
    expect(r.suggestion).toEqual({
      nameZh: "槓鈴臥推",
      kind: "strength",
      muscleGroup: "chest",
      equipment: "barbell",
    });
    const row = await usageRow();
    expect(row).toMatchObject({ count: 1, inputTokens: 10, outputTokens: 5 });
  });

  it("drops unknown slugs and duplicates", async () => {
    const [a, b] = [slugs[0]!, slugs[1]!];
    next = reply(guess({ candidates: ["unknown-slug", a, a, b] }));
    expect(found(await run()).candidates.map((e) => e.slug)).toEqual([a, b]);
  });

  it("keeps at most 5 candidates", async () => {
    next = reply(guess({ candidates: slugs.slice(0, 7) }));
    expect(found(await run()).candidates.map((e) => e.slug)).toEqual(
      slugs.slice(0, 5),
    );
  });

  it("still finds with no valid candidates", async () => {
    next = reply(guess({ candidates: ["nope", "nada"] }));
    const r = found(await run());
    expect(r.candidates).toEqual([]);
    expect(r.suggestion.equipment).toBe("barbell");
  });

  it("cardio equipment forces kind cardio and no muscle group", async () => {
    next = reply(guess({ equipment: "treadmill", muscleGroup: "chest" }));
    expect(found(await run()).suggestion).toMatchObject({
      kind: "cardio",
      muscleGroup: null,
      equipment: "treadmill",
    });
  });

  it("muscle group none or unknown becomes null", async () => {
    next = reply(guess({ muscleGroup: "none" }));
    expect(found(await run()).suggestion).toMatchObject({
      kind: "strength",
      muscleGroup: null,
    });
    next = reply(guess({ muscleGroup: "wings" }));
    expect(found(await run()).suggestion.muscleGroup).toBeNull();
  });

  it("unknown or none equipment is not_equipment", async () => {
    next = reply(guess({ equipment: "spaceship" }));
    expect(await run()).toEqual({ outcome: "not_equipment" });
    next = reply(guess({ equipment: "none" }));
    expect(await run()).toEqual({ outcome: "not_equipment" });
    expect((await usageRow())?.count).toBe(2);
  });

  it("blank name falls back to the equipment label, long name is cut to 30", async () => {
    next = reply(guess({ nameZh: "   " }));
    expect(found(await run()).suggestion.nameZh).toBe(EQUIPMENT_LABELS.barbell);
    next = reply(guess({ nameZh: ` ${"字".repeat(40)} ` }));
    expect(found(await run()).suggestion.nameZh).toBe("字".repeat(30));
  });

  it("maps not_equipment and refused, each costing a use", async () => {
    next = async () => ({ kind: "not_equipment", usage: USAGE });
    expect(await run()).toEqual({ outcome: "not_equipment" });
    next = async () => ({ kind: "refused", usage: USAGE });
    expect(await run()).toEqual({ outcome: "refused" });
    expect((await usageRow())?.count).toBe(2);
  });

  it("a bad image is invalid_image: no AI call, no use", async () => {
    expect(await run(Buffer.from("nope"))).toEqual({
      outcome: "invalid_image",
    });
    expect(calls).toEqual([]);
    expect(await usageRow()).toBeUndefined();
  });

  it("shares the daily photo limit with meal photos", async () => {
    await db.insert(aiUsageDaily).values({
      userId,
      day: "2026-10-19",
      kind: "photo",
      count: AI_DAILY_LIMITS.photo,
    });
    expect(await run()).toEqual({ outcome: "limit" });
    expect(calls).toEqual([]);
  });

  it("AiUnavailable is unavailable and gives the use back", async () => {
    next = async () => {
      throw new AiUnavailable("down");
    };
    expect(await run()).toEqual({ outcome: "unavailable" });
    expect((await usageRow())?.count).toBe(0);
  });

  it("only built-in exercises reach the identifier", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/exercises",
      headers,
      payload: {
        nameZh: "自訂器材",
        kind: "strength",
        muscleGroup: "back",
        equipment: "cable",
      },
    });
    expect(created.statusCode).toBe(201);
    resetBuiltinLibraryCache();
    await run();
    expect(seen.length).toBe(slugs.length);
    expect(seen.every((e) => !e.isCustom && e.slug !== null)).toBe(true);
  });

  it("gives the identifier the library in slug code-unit order", async () => {
    await run();
    const order = seen.map((e) => e.slug!);
    expect(order).toEqual([...order].sort((a, b) => (a < b ? -1 : 1)));
  });

  it("shapeGuess and bySlugOrder work without a database", () => {
    const ex = (slug: string) => ({ slug }) as never;
    expect(["b_x", "a-z", "B", "a"].map(ex).sort(bySlugOrder)).toEqual(
      ["B", "a", "a-z", "b_x"].map(ex),
    );
    expect(shapeGuess(guess({ equipment: "none" }), [])).toEqual({
      outcome: "not_equipment",
    });
    expect(shapeGuess(guess({ equipment: "bogus" }), [])).toEqual({
      outcome: "not_equipment",
    });
  });

  describe("endpoint", () => {
    const post = (payload: Buffer | string, type: string, h = headers) =>
      app.inject({
        method: "POST",
        url: "/exercises/identify",
        headers: { ...h, "content-type": type },
        payload,
      });

    it("401s without a session", async () => {
      const res = await post(await jpeg(), "application/octet-stream", {});
      expect(res.statusCode).toBe(401);
    });

    it("200s with the identify response", async () => {
      next = reply(guess({ candidates: [slugs[0]!] }));
      const res = await post(await jpeg(), "application/octet-stream");
      expect(res.statusCode).toBe(200);
      const body = res.json<IdentifyEquipmentResponse>();
      expect(found(body).candidates.map((e) => e.slug)).toEqual([slugs[0]]);
    });

    it("415s a JSON body", async () => {
      const res = await post("{}", "application/json");
      expect(res.statusCode).toBe(415);
      expect(res.json()).toEqual({ error: "unsupported_media_type" });
      expect(calls).toEqual([]);
    });

    it("413s over the size limit", async () => {
      const res = await post(
        Buffer.alloc(MEAL_PHOTO_MAX_BYTES + 1),
        "application/octet-stream",
      );
      expect(res.statusCode).toBe(413);
      expect(calls).toEqual([]);
    });

    it("POST /exercises still takes JSON", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/exercises",
        headers,
        payload: {
          nameZh: "另一個",
          kind: "strength",
          muscleGroup: "back",
          equipment: "cable",
        },
      });
      expect(res.statusCode).toBe(201);
    });
  });
});
