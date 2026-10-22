import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import { buildApp } from "../src/app.js";
import { issueSession } from "../src/auth/session";
import type { AppDeps } from "../src/deps.js";
import {
  RATE_LIMIT_IP_MAX,
  RATE_LIMIT_USER_MAX,
  rateLimitOptions,
} from "../src/rate-limit";
import { syncUser } from "../src/users/repo";
import {
  createTestDb,
  unusedAdvisor,
  unusedEquipmentIdentifier,
  unusedMealParser,
  unusedPhotoStore,
} from "./db";

const SECRET = new Uint8Array(32).fill(7);
const BOT = "bot-runtime@x.iam.gserviceaccount.com";

describe("rate limit", () => {
  let deps: AppDeps;
  let closeDb: () => Promise<void>;
  let app: ReturnType<typeof buildApp>;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const t = await createTestDb();
    closeDb = t.close;
    const a = await syncUser(t.db, `U${"a".repeat(32)}`, "A");
    const b = await syncUser(t.db, `U${"b".repeat(32)}`, "B");
    tokenA = await issueSession(SECRET, a.userId);
    tokenB = await issueSession(SECRET, b.userId);
    deps = {
      db: t.db,
      verifyServiceToken: async (token) => {
        if (token === "good") return { email: BOT };
        throw new Error("invalid token");
      },
      botServiceAccount: BOT,
      verifyLineIdToken: async () => ({ sub: "U", name: null }),
      notifyWorkoutFinished: async () => {},
      mealParser: unusedMealParser,
      equipmentIdentifier: unusedEquipmentIdentifier,
      advisor: unusedAdvisor,
      photoStore: unusedPhotoStore,
      sessionSecret: SECRET,
      corsOrigin: "http://localhost",
      now: () => new Date(),
    };
  });
  afterAll(() => closeDb());

  // A fresh app per test: the in-memory counters start at zero.
  const fresh = () => {
    app = buildApp(deps);
    return app;
  };
  afterEach(() => app?.close());

  const getMe = (headers: Record<string, string> = {}, ip = "10.0.0.1") =>
    app.inject({ method: "GET", url: "/me", headers, remoteAddress: ip });

  it("limits anonymous requests per IP and replies rate_limited", async () => {
    fresh();
    for (let i = 0; i < RATE_LIMIT_IP_MAX; i++) {
      expect((await getMe()).statusCode).toBe(401);
    }
    const res = await getMe();
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: "rate_limited" });
    expect(res.headers["retry-after"]).toBeDefined();

    expect((await getMe({}, "10.0.0.2")).statusCode).toBe(401);
  });

  it("keys on the last X-Forwarded-For hop, not client-supplied ones", async () => {
    fresh();
    let last = 0;
    for (let n = 0; n <= RATE_LIMIT_IP_MAX; n++) {
      const res = await getMe({ "x-forwarded-for": `1.2.3.${n}, 5.6.7.8` });
      last = res.statusCode;
    }
    expect(last).toBe(429);
  });

  it("counts invalid tokens per IP", async () => {
    fresh();
    let last = 0;
    for (let n = 0; n <= RATE_LIMIT_IP_MAX; n++) {
      last = (await getMe({ authorization: "Bearer nope" })).statusCode;
    }
    expect(last).toBe(429);
  });

  it("limits signed-in users per user, not per shared IP", async () => {
    fresh();
    const a = { authorization: `Bearer ${tokenA}` };
    for (let i = 0; i < RATE_LIMIT_USER_MAX; i++) {
      expect((await getMe(a, "10.0.0.9")).statusCode).toBe(200);
    }
    expect((await getMe(a, "10.0.0.9")).statusCode).toBe(429);
    const b = { authorization: `Bearer ${tokenB}` };
    expect((await getMe(b, "10.0.0.9")).statusCode).toBe(200);
  });

  it("never limits /health", async () => {
    fresh();
    for (let i = 0; i < 200; i++) {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
    }
  });

  it("never limits /internal routes", async () => {
    fresh();
    for (let i = 0; i < 40; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/internal/users/sync",
        payload: { lineUserId: `U${"c".repeat(32)}` },
        headers: { authorization: "Bearer good" },
      });
      expect(res.statusCode).not.toBe(429);
    }
  });

  it("never limits /jobs routes (Cloud Scheduler)", async () => {
    // PR 10.1 adds POST /jobs/daily; a stand-in route here keeps this test
    // independent of it, with a control route that is limited.
    fresh();
    app.post("/jobs/daily", async () => ({ ok: true }));
    app.post("/jobsx", async () => ({ ok: true }));
    const hit = (url: string) =>
      app.inject({ method: "POST", url, remoteAddress: "10.0.0.5" });
    for (let i = 0; i < 40; i++) {
      expect((await hit("/jobs/daily")).statusCode).toBe(200);
    }
    let last = 0;
    for (let i = 0; i <= RATE_LIMIT_IP_MAX; i++) {
      last = (await hit("/jobsx")).statusCode;
    }
    expect(last).toBe(429);

    const opts = rateLimitOptions(SECRET);
    const allow = opts.allowList as (
      req: FastifyRequest,
      key: string,
    ) => boolean;
    const req = (url: string) =>
      ({ routeOptions: { url } }) as unknown as FastifyRequest;
    expect(allow(req("/jobs/daily"), "ip:x")).toBe(true);
    expect(allow(req("/health"), "ip:x")).toBe(true);
    expect(allow(req("/internal/users/sync"), "ip:x")).toBe(true);
    expect(allow(req("/me"), "ip:x")).toBe(false);
    expect(allow(req("/jobsx"), "ip:x")).toBe(false);
  });
});
