import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { issueSession } from "../src/auth/session";
import { recordConsent, syncUser, type Db } from "../src/users/repo";
import { createTestDb } from "./db";
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
      verifyLineIdToken: async (tok) => {
        if (tok === "ok") return { sub: U_OK, name: "Amy" };
        if (tok === "noconsent") return { sub: U_NOCONSENT, name: null };
        if (tok === "unknown") return { sub: U_UNKNOWN, name: "Zed" };
        throw new Error("bad");
      },
      sessionSecret: SECRET,
      corsOrigin: ORIGIN,
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
});
