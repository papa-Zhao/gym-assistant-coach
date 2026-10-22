import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { issueSession } from "../src/auth/session";
import { recordConsent, syncUser, type Db } from "../src/users/repo";
import {
  createTestDb,
  unusedMealParser,
  unusedPhotoStore,
  unusedAdvisor,
  unusedEquipmentIdentifier,
} from "./db";
import { CONSENT_VERSION } from "@gac/shared";

const SECRET = new Uint8Array(32).fill(7);
const ORIGIN = "https://liff.example";
const U_OK = `U${"a".repeat(32)}`;
const U_NOCONSENT = `U${"b".repeat(32)}`;
const U_UNKNOWN = `U${"c".repeat(32)}`;

describe("auth", () => {
  let app: ReturnType<typeof buildApp>;
  let db: Db;
  let closeDb: () => Promise<void>;
  let okUserId: string;

  beforeAll(async () => {
    const t = await createTestDb();
    db = t.db;
    closeDb = t.close;
    okUserId = (await syncUser(db, U_OK, "Old")).userId;
    await recordConsent(db, U_OK, CONSENT_VERSION);
    await syncUser(db, U_NOCONSENT, "NoC");
    const deps: AppDeps = {
      db,
      verifyServiceToken: async () => {
        throw new Error("unused");
      },
      botServiceAccount: "bot@x",
      schedulerServiceAccount: "scheduler@x",
      verifyLineIdToken: async (tok) => {
        if (tok === "ok") return { sub: U_OK, name: "Amy" };
        if (tok === "noconsent") return { sub: U_NOCONSENT, name: null };
        if (tok === "unknown") return { sub: U_UNKNOWN, name: "Zed" };
        throw new Error("bad");
      },
      notifyWorkoutFinished: async () => {},
      mealParser: unusedMealParser,
      equipmentIdentifier: unusedEquipmentIdentifier,
      advisor: unusedAdvisor,
      photoStore: unusedPhotoStore,
      sessionSecret: SECRET,
      corsOrigin: ORIGIN,
      now: () => new Date("2026-10-19T04:00:00Z"),
    };
    app = buildApp(deps);
  });
  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  const login = (idToken: unknown) =>
    app.inject({ method: "POST", url: "/auth/liff", payload: { idToken } });

  it("consented user gets a token and /me returns name", async () => {
    const res = await login("ok");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ expiresIn: 3600, displayName: "Amy" });
    const me = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${body.accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({ displayName: "Amy" });
  });

  it("unknown user gets 403 consent_required", async () => {
    const res = await login("unknown");
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "consent_required" });
  });

  it("user without consent gets 403 consent_required", async () => {
    const res = await login("noconsent");
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "consent_required" });
  });

  it("invalid LINE token gets 401", async () => {
    const res = await login("nope");
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
  });

  it("missing idToken gets 400 bad_request", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/liff",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "bad_request" });
  });

  it("/me rejects missing token with 401", async () => {
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
  });

  it("/me rejects expired token with 401", async () => {
    const old = new Date(Date.now() - 2 * 3600 * 1000);
    const token = await issueSession(SECRET, okUserId, old);
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("/me rejects token signed with another secret with 401", async () => {
    const token = await issueSession(new Uint8Array(32).fill(9), okUserId);
    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("DELETE /me rejects a missing token with 401", async () => {
    const res = await app.inject({ method: "DELETE", url: "/me" });
    expect(res.statusCode).toBe(401);
  });

  it("DELETE /me returns 204 and the same token stops working everywhere", async () => {
    const lineId = `U${"d".repeat(32)}`;
    const { userId } = await syncUser(db, lineId, "Del");
    await recordConsent(db, lineId, CONSENT_VERSION);
    const token = await issueSession(SECRET, userId);
    const call = (method: "GET" | "DELETE", url: string) =>
      app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${token}` },
      });
    expect((await call("GET", "/me")).statusCode).toBe(200);
    const del = await call("DELETE", "/me");
    expect(del.statusCode).toBe(204);
    expect(del.body).toBe("");
    for (const url of [
      "/me",
      "/profile",
      "/workouts/week",
      "/meals?date=2026-10-19",
    ]) {
      const res = await call("GET", url);
      expect(res.statusCode, url).toBe(401);
      expect(res.json()).toEqual({ error: "unauthorized" });
    }
    expect((await call("DELETE", "/me")).statusCode).toBe(401);
  });

  it("CORS allows configured origin only", async () => {
    const preflight = (origin: string) =>
      app.inject({
        method: "OPTIONS",
        url: "/auth/liff",
        headers: {
          origin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      });
    const good = await preflight(ORIGIN);
    expect(good.headers["access-control-allow-origin"]).toBe(ORIGIN);
    const evil = await preflight("https://evil.example");
    expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("CORS preflight allows PUT with authorization for the LIFF origin", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/profile",
      headers: {
        origin: ORIGIN,
        "access-control-request-method": "PUT",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
    const methods = String(res.headers["access-control-allow-methods"])
      .split(",")
      .map((m) => m.trim());
    expect(methods).toContain("PUT");
  });

  it("CORS preflight allows DELETE for the LIFF origin", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/templates/x",
      headers: {
        origin: ORIGIN,
        "access-control-request-method": "DELETE",
        "access-control-request-headers": "authorization",
      },
    });
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
    const methods = String(res.headers["access-control-allow-methods"])
      .split(",")
      .map((m) => m.trim());
    expect(methods).toContain("DELETE");
  });
});

describe("error handling", () => {
  const LEAK = "Failed query: select * from users\nparams: Uabc";
  const build = async (throwing: boolean) => {
    const t = await createTestDb();
    const lines: string[] = [];
    const stream = { write: (l: string) => void lines.push(l) };
    const app = buildApp(
      {
        db: t.db,
        verifyServiceToken: async () => {
          throw new Error("unused");
        },
        botServiceAccount: "bot@x",
        schedulerServiceAccount: "scheduler@x",
        verifyLineIdToken: async () => {
          if (throwing) throw new Error(LEAK);
          return { sub: "Uabc", name: null };
        },
        notifyWorkoutFinished: async () => {},
        mealParser: unusedMealParser,
        equipmentIdentifier: unusedEquipmentIdentifier,
        advisor: unusedAdvisor,
        photoStore: unusedPhotoStore,
        sessionSecret: SECRET,
        corsOrigin: ORIGIN,
        now: () => new Date("2026-10-19T04:00:00Z"),
      },
      { logger: { level: "info", stream } },
    );
    app.get("/boom", async () => {
      throw new Error(LEAK);
    });
    return { app, lines, close: t.close };
  };

  it("5xx replies a fixed internal body and logs no query text or ids", async () => {
    const { app, lines, close } = await build(false);
    try {
      const res = await app.inject({ method: "GET", url: "/boom" });
      expect(res.statusCode).toBe(500);
      expect(res.body).toBe('{"error":"internal"}');
      const logs = lines.join("");
      expect(logs).toContain("internal error");
      expect(logs).not.toContain("Failed query");
      expect(logs).not.toContain("Uabc");
    } finally {
      await app.close();
      await close();
    }
  });

  it("malformed JSON on /auth/liff is 400 bad_request", async () => {
    const { app, close } = await build(false);
    try {
      const res = await app.inject({
        method: "POST",
        url: "/auth/liff",
        headers: { "content-type": "application/json" },
        payload: "{not json",
      });
      expect(res.statusCode).toBe(400);
      expect(res.body).toBe('{"error":"bad_request"}');
    } finally {
      await app.close();
      await close();
    }
  });
});
