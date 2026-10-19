import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { CONSENT_VERSION } from "@gac/shared";
import { saveProfile } from "../src/profile/repo";
import { findByLineUserId, type Db } from "../src/users/repo";
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

  it("today uses Taipei date", async () => {
    nowIso = "2026-10-18T16:30:00Z";
    try {
      const res = await post("/internal/users/today", { lineUserId: LINE_ID });
      expect(res.json().date).toBe("2026-10-19");
    } finally {
      nowIso = "2026-10-19T04:00:00Z";
    }
  });

  it("GET /health still works without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });
});
