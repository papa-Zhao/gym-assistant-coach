import type { DayMeals, Food, Meal } from "@gac/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { issueSession } from "../src/auth/session";
import { syncUser, type Db } from "../src/users/repo";
import { createTestDb } from "./db";

const SECRET = new Uint8Array(32).fill(9);
const ZERO = "00000000-0000-4000-8000-000000000000";
const DAY = "2026-10-22";
let nowIso = "2026-10-22T04:00:00Z";

describe("meal routes", () => {
  let app: ReturnType<typeof buildApp>;
  let db: Db;
  let closeDb: () => Promise<void>;
  let hA: Record<string, string>;
  let hB: Record<string, string>;
  let rice: Food;

  beforeAll(async () => {
    const t = await createTestDb();
    db = t.db;
    closeDb = t.close;
    const a = (await syncUser(db, `U${"a".repeat(32)}`, null)).userId;
    const b = (await syncUser(db, `U${"b".repeat(32)}`, null)).userId;
    hA = { authorization: `Bearer ${await issueSession(SECRET, a)}` };
    hB = { authorization: `Bearer ${await issueSession(SECRET, b)}` };
    app = buildApp({
      db,
      verifyServiceToken: async () => {
        throw new Error("unused");
      },
      botServiceAccount: "bot@x",
      verifyLineIdToken: async () => ({
        sub: `U${"a".repeat(32)}`,
        name: null,
      }),
      notifyWorkoutFinished: async () => {},
      sessionSecret: SECRET,
      corsOrigin: "http://localhost",
      now: () => new Date(nowIso),
    });
    const found = await app.inject({
      method: "GET",
      url: `/foods?q=${encodeURIComponent("白飯")}`,
      headers: hA,
    });
    rice = found.json<{ foods: Food[] }>().foods[0] as Food;
  });
  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  const req = (
    method: "GET" | "POST" | "PUT" | "DELETE",
    url: string,
    headers = hA,
    payload?: unknown,
  ) =>
    app.inject({
      method,
      url,
      headers,
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  const body = (grams: unknown, extra: object = {}) => ({
    eatenOn: DAY,
    mealType: "lunch",
    items: [{ foodId: rice.id, grams }],
    ...extra,
  });
  const create = async (headers = hA, grams = 150) =>
    (await req("POST", "/meals", headers, body(grams))).json<Meal>();

  it("GET /meals switches day at Taipei midnight", async () => {
    const m = await create(hB);
    expect(m.eatenOn).toBe(DAY);
    try {
      nowIso = "2026-10-21T15:59:59Z";
      const before = (await req("GET", "/meals", hB)).json<DayMeals>();
      expect(before.date).toBe("2026-10-21");
      expect(before.meals).toEqual([]);
      nowIso = "2026-10-21T16:00:00Z";
      const after = (await req("GET", "/meals", hB)).json<DayMeals>();
      expect(after.date).toBe("2026-10-22");
      expect(after.meals.map((x) => x.id)).toContain(m.id);
      expect(after.meals.every((x) => x.eatenOn === "2026-10-22")).toBe(true);
    } finally {
      nowIso = "2026-10-22T04:00:00Z";
    }
    await req("DELETE", `/meals/${m.id}`, hB);
  });

  it("requires a session on every route", async () => {
    for (const [m, u] of [
      ["GET", "/foods?q=a"],
      ["GET", "/meals"],
      ["GET", `/meals/${ZERO}`],
      ["POST", "/meals"],
      ["PUT", `/meals/${ZERO}`],
      ["DELETE", `/meals/${ZERO}`],
    ] as const) {
      expect((await req(m, u, {})).statusCode).toBe(401);
    }
  });

  it("searches foods", async () => {
    const res = await req("GET", `/foods?q=${encodeURIComponent("白飯")}`);
    expect(res.statusCode).toBe(200);
    expect(res.json<{ foods: Food[] }>().foods.map((f) => f.name)).toContain(
      "白飯",
    );
  });

  it("rejects an empty or missing or overlong q", async () => {
    expect((await req("GET", "/foods?q=")).statusCode).toBe(400);
    expect((await req("GET", "/foods?q=%20%20%20")).statusCode).toBe(400);
    expect((await req("GET", "/foods")).statusCode).toBe(400);
    expect((await req("GET", `/foods?q=${"a".repeat(41)}`)).statusCode).toBe(
      400,
    );
  });

  it("creates a meal that the day view shows", async () => {
    const res = await req("POST", "/meals", hA, body(200));
    expect(res.statusCode).toBe(201);
    const meal = res.json<Meal>();
    expect(meal.source).toBe("manual");
    const day = (await req("GET", `/meals?date=${DAY}`)).json<DayMeals>();
    expect(day.meals.map((m) => m.id)).toContain(meal.id);
    const sum = day.meals.reduce((s, m) => s + m.total.kcal, 0);
    expect(day.consumed.kcal).toBe(sum);
    expect(day.consumed.kcal).toBeGreaterThanOrEqual(meal.total.kcal);
  });

  it("consumed equals the total of a lone meal", async () => {
    const day = "2026-09-01";
    const meal = (
      await req("POST", "/meals", hB, body(150, { eatenOn: day }))
    ).json<Meal>();
    const res = (await req("GET", `/meals?date=${day}`, hB)).json<DayMeals>();
    expect(res.consumed).toEqual(meal.total);
  });

  it("defaults the day to today in Taipei", async () => {
    expect((await req("GET", "/meals")).json<DayMeals>().date).toBe(DAY);
  });

  it("rejects a malformed or impossible date", async () => {
    expect((await req("GET", "/meals?date=2026-1-2")).statusCode).toBe(400);
    expect((await req("GET", "/meals?date=2026-02-31")).statusCode).toBe(400);
    const res = await req("POST", "/meals", hA, body(100, { eatenOn: "x" }));
    expect(res.statusCode).toBe(400);
  });

  it.each([0, -5, 2000.1, 0.55, "150", 150.05])(
    "rejects grams %j",
    async (g) => {
      expect((await req("POST", "/meals", hA, body(g))).statusCode).toBe(400);
    },
  );

  it("returns invalid_grams for in-range grams with too many decimals", async () => {
    const res = await req("POST", "/meals", hA, body(150.05));
    expect(res.json()).toEqual({ error: "invalid_grams" });
  });

  it("accepts 1.2 g", async () => {
    const res = await req("POST", "/meals", hA, body(1.2));
    expect(res.statusCode).toBe(201);
    expect(res.json<Meal>().items[0]?.grams).toBe(1.2);
  });

  it("rejects 31 items and an empty list", async () => {
    const items = Array.from({ length: 31 }, () => ({
      foodId: rice.id,
      grams: 10,
    }));
    expect(
      (await req("POST", "/meals", hA, body(10, { items }))).statusCode,
    ).toBe(400);
    expect(
      (await req("POST", "/meals", hA, body(10, { items: [] }))).statusCode,
    ).toBe(400);
  });

  it("requires exactly one of id or foodId per item", async () => {
    for (const item of [
      { grams: 10 },
      { id: ZERO, foodId: rice.id, grams: 10 },
    ]) {
      const res = await req("POST", "/meals", hA, body(10, { items: [item] }));
      expect(res.statusCode).toBe(400);
    }
  });

  it("maps unknown food to 400 unknown_food on create and update", async () => {
    const bad = { items: [{ foodId: ZERO, grams: 10 }] };
    const c = await req("POST", "/meals", hA, body(10, bad));
    expect(c.statusCode).toBe(400);
    expect(c.json()).toEqual({ error: "unknown_food" });
    const meal = await create();
    const u = await req("PUT", `/meals/${meal.id}`, hA, {
      mealType: "dinner",
      ...bad,
    });
    expect(u.statusCode).toBe(400);
    expect(u.json()).toEqual({ error: "unknown_food" });
  });

  it("maps unknown item to 400 unknown_item", async () => {
    const meal = await create();
    const res = await req("PUT", `/meals/${meal.id}`, hA, {
      mealType: "dinner",
      items: [{ id: ZERO, grams: 10 }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "unknown_item" });
  });

  it("updates a meal, keeping an item by id", async () => {
    const meal = await create();
    const res = await req("PUT", `/meals/${meal.id}`, hA, {
      mealType: "dinner",
      items: [{ id: meal.items[0]?.id, grams: 300 }],
    });
    expect(res.statusCode).toBe(200);
    const next = res.json<Meal>();
    expect(next.mealType).toBe("dinner");
    expect(next.items[0]?.grams).toBe(300);
    expect(next.items[0]?.id).toBe(meal.items[0]?.id);
  });

  it("answers 400, never 500, for non-uuid ids", async () => {
    expect((await req("GET", "/meals/not-a-uuid")).statusCode).toBe(400);
    expect(
      (await req("PUT", "/meals/not-a-uuid", hA, body(10))).statusCode,
    ).toBe(400);
    expect((await req("DELETE", "/meals/not-a-uuid")).statusCode).toBe(400);
    const items = [{ foodId: "nope", grams: 10 }];
    expect(
      (await req("POST", "/meals", hA, body(10, { items }))).statusCode,
    ).toBe(400);
    const itemId = [{ id: "nope", grams: 10 }];
    expect(
      (await req("POST", "/meals", hA, body(10, { items: itemId }))).statusCode,
    ).toBe(400);
  });

  it("hides another user's meal behind 404", async () => {
    const meal = await create(hA);
    const before = (await req("GET", `/meals/${meal.id}`, hA)).json<Meal>();
    expect((await req("GET", `/meals/${meal.id}`, hB)).statusCode).toBe(404);
    expect(
      (
        await req("PUT", `/meals/${meal.id}`, hB, {
          mealType: "snack",
          items: [{ foodId: rice.id, grams: 999 }],
        })
      ).statusCode,
    ).toBe(404);
    expect((await req("DELETE", `/meals/${meal.id}`, hB)).statusCode).toBe(404);
    const after = (await req("GET", `/meals/${meal.id}`, hA)).json<Meal>();
    expect(after).toEqual(before);
  });

  it("deletes, then 404s", async () => {
    const meal = await create();
    expect((await req("DELETE", `/meals/${meal.id}`)).statusCode).toBe(204);
    expect((await req("GET", `/meals/${meal.id}`)).statusCode).toBe(404);
    expect((await req("DELETE", `/meals/${meal.id}`)).statusCode).toBe(404);
  });
});
