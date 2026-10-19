import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { issueSession } from "../src/auth/session";
import { listMetrics, previousMetric, recordMetric } from "../src/metrics/repo";
import { syncUser, type Db } from "../src/users/repo";
import { createTestDb } from "./db";

const BOT = "bot-runtime@x.iam.gserviceaccount.com";
const SECRET = new Uint8Array(32).fill(9);
const U1 = `U${"a".repeat(32)}`;
const U2 = `U${"b".repeat(32)}`;

describe("metrics repo", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function setup() {
    const t = await createTestDb();
    close = t.close;
    const { userId } = await syncUser(t.db, U1, null);
    return { db: t.db, userId };
  }

  it("recordMetric only touches its column", async () => {
    const { db, userId } = await setup();
    await recordMetric(db, userId, "2026-10-19", "weightKg", 72.5);
    await recordMetric(db, userId, "2026-10-19", "waistCm", 80);
    expect(await listMetrics(db, userId, "2026-10-19", "2026-10-19")).toEqual([
      { date: "2026-10-19", weightKg: 72.5, bodyFatPct: null, waistCm: 80 },
    ]);
  });

  it("same day twice overwrites", async () => {
    const { db, userId } = await setup();
    await recordMetric(db, userId, "2026-10-19", "weightKg", 72.5);
    await recordMetric(db, userId, "2026-10-19", "weightKg", 71.26);
    const rows = await listMetrics(db, userId, "2026-10-19", "2026-10-19");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.weightKg).toBe(71.3);
  });

  it("previousMetric ignores today and null columns", async () => {
    const { db, userId } = await setup();
    await recordMetric(db, userId, "2026-10-10", "weightKg", 73);
    await recordMetric(db, userId, "2026-10-14", "waistCm", 81);
    await recordMetric(db, userId, "2026-10-19", "weightKg", 72);
    expect(await previousMetric(db, userId, "weightKg", "2026-10-19")).toEqual({
      value: 73,
      date: "2026-10-10",
    });
    expect(await previousMetric(db, userId, "bodyFatPct", "2026-10-19")).toBe(
      null,
    );
  });
});

describe("metrics routes", () => {
  let app: ReturnType<typeof buildApp>;
  let db: Db;
  let closeDb: () => Promise<void>;
  let h1: Record<string, string>;
  let h2: Record<string, string>;
  let nowIso = "2026-10-19T04:00:00Z";
  const bot = { authorization: "Bearer good" };

  beforeAll(async () => {
    const t = await createTestDb();
    db = t.db;
    closeDb = t.close;
    const id1 = (await syncUser(db, U1, null)).userId;
    const id2 = (await syncUser(db, U2, null)).userId;
    h1 = { authorization: `Bearer ${await issueSession(SECRET, id1)}` };
    h2 = { authorization: `Bearer ${await issueSession(SECRET, id2)}` };
    const deps: AppDeps = {
      db,
      verifyServiceToken: async (token) => {
        if (token === "good") return { email: BOT };
        throw new Error("invalid token");
      },
      botServiceAccount: BOT,
      verifyLineIdToken: async () => ({ sub: U1, name: null }),
      notifyWorkoutFinished: async () => {},
      sessionSecret: SECRET,
      corsOrigin: "http://localhost",
      now: () => new Date(nowIso),
    };
    app = buildApp(deps);
  });
  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  const record = (payload: unknown) =>
    app.inject({
      method: "POST",
      url: "/internal/body-metrics",
      headers: bot,
      payload: payload as object,
    });

  it("internal record returns previous from an earlier day", async () => {
    const u = (await syncUser(db, `U${"c".repeat(32)}`, null)).userId;
    await recordMetric(db, u, "2026-10-14", "weightKg", 72.9);
    const res = await record({
      lineUserId: `U${"c".repeat(32)}`,
      key: "weightKg",
      value: 72.5,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      key: "weightKg",
      value: 72.5,
      date: "2026-10-19",
      previous: { value: 72.9, date: "2026-10-14" },
    });
  });

  it("internal record first time has null previous", async () => {
    const res = await record({
      lineUserId: `U${"d".repeat(32)}`,
      key: "bodyFatPct",
      value: 18.04,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      key: "bodyFatPct",
      value: 18,
      date: "2026-10-19",
      previous: null,
    });
  });

  it("internal record rejects out-of-range value with 400", async () => {
    for (const body of [
      { key: "weightKg", value: 20 },
      { key: "bodyFatPct", value: 61 },
      { key: "heightCm", value: 70 },
    ]) {
      const res = await record({ lineUserId: U1, ...body });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "bad_request" });
    }
  });

  it("GET /body-metrics rejects days=10", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/body-metrics?days=10",
      headers: h1,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "bad_request" });
  });

  it("GET /body-metrics returns window in Taipei dates", async () => {
    nowIso = "2026-10-19T16:30:00Z";
    try {
      const res = await app.inject({
        method: "GET",
        url: "/body-metrics?days=7",
        headers: h1,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        from: "2026-10-14",
        to: "2026-10-20",
      });
    } finally {
      nowIso = "2026-10-19T04:00:00Z";
    }
  });

  it("PUT /body-metrics/today writes only given fields", async () => {
    const put = (payload: unknown) =>
      app.inject({
        method: "PUT",
        url: "/body-metrics/today",
        headers: h1,
        payload: payload as object,
      });
    expect((await put({ weightKg: 71.2 })).statusCode).toBe(200);
    const res = await put({ waistCm: 80.44 });
    expect(res.statusCode).toBe(200);
    const today = res
      .json()
      .points.find((p: { date: string }) => p.date === "2026-10-19");
    expect(today).toEqual({
      date: "2026-10-19",
      weightKg: 71.2,
      bodyFatPct: null,
      waistCm: 80.4,
    });
    for (const bad of [{}, { weightKg: 500 }, { weightKg: 70, waistCm: 5 }]) {
      const r = await put(bad);
      expect(r.statusCode).toBe(400);
      expect(r.json()).toEqual({ error: "bad_request" });
    }
    // A rejected request must not have written the valid field.
    const after = await app.inject({
      method: "GET",
      url: "/body-metrics?days=7",
      headers: h1,
    });
    expect(after.json().points).toHaveLength(1);
  });

  it("metrics routes need a session (401)", async () => {
    for (const [m, u] of [
      ["GET", "/body-metrics"],
      ["PUT", "/body-metrics/today"],
    ] as const) {
      const res = await app.inject({ method: m, url: u, payload: {} });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "unauthorized" });
    }
    const res = await app.inject({
      method: "POST",
      url: "/internal/body-metrics",
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it("metrics are isolated per user", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/body-metrics?days=30",
      headers: h2,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().points).toEqual([]);
  });
});
