import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { issueSession } from "../src/auth/session";
import { syncUser, type Db } from "../src/users/repo";
import {
  createTestDb,
  unusedMealParser,
  unusedPhotoStore,
  unusedEquipmentIdentifier,
} from "./db";

const SECRET = new Uint8Array(32).fill(9);
const U1 = `U${"a".repeat(32)}`;
const U2 = `U${"b".repeat(32)}`;
const valid = {
  sex: "male",
  birthYear: 1990,
  heightCm: 175,
  weightKg: 70,
  activityLevel: "moderate",
  goal: "maintain",
};

describe("profile routes", () => {
  let app: ReturnType<typeof buildApp>;
  let db: Db;
  let closeDb: () => Promise<void>;
  let h1: Record<string, string>;
  let h2: Record<string, string>;

  beforeAll(async () => {
    const t = await createTestDb();
    db = t.db;
    closeDb = t.close;
    const id1 = (await syncUser(db, U1, null)).userId;
    const id2 = (await syncUser(db, U2, null)).userId;
    h1 = { authorization: `Bearer ${await issueSession(SECRET, id1)}` };
    h2 = { authorization: `Bearer ${await issueSession(SECRET, id2)}` };
    const unused = async (): Promise<never> => {
      throw new Error("unused");
    };
    const deps: AppDeps = {
      db,
      verifyServiceToken: unused,
      botServiceAccount: "bot@x",
      verifyLineIdToken: unused,
      notifyWorkoutFinished: async () => {},
      mealParser: unusedMealParser,
      equipmentIdentifier: unusedEquipmentIdentifier,
      photoStore: unusedPhotoStore,
      sessionSecret: SECRET,
      corsOrigin: "http://localhost",
      now: () => new Date("2026-10-19T04:00:00Z"),
    };
    app = buildApp(deps);
  });
  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  const req = (
    method: "GET" | "PUT",
    url: string,
    headers: Record<string, string>,
    payload?: unknown,
  ) => app.inject({ method, url, headers, payload: payload as object });

  it("profile routes need a session (401)", async () => {
    for (const [m, u] of [
      ["GET", "/profile"],
      ["PUT", "/profile"],
      ["PUT", "/profile/targets"],
    ] as const) {
      const res = await req(m, u, {}, {});
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "unauthorized" });
    }
  });

  it("GET /profile without profile returns nulls", async () => {
    const res = await req("GET", "/profile", h1);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      profile: null,
      targets: null,
      floorKcal: null,
      belowFloor: false,
    });
  });

  it("PUT /profile rejects 2009 birth year with 400", async () => {
    const res = await req("PUT", "/profile", h1, { ...valid, birthYear: 2009 });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "bad_request" });
  });

  it("PUT /profile rejects schema violations with 400", async () => {
    for (const bad of [
      { ...valid, sex: "x" },
      { ...valid, heightCm: 999 },
    ]) {
      const res = await req("PUT", "/profile", h1, bad);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "bad_request" });
    }
  });

  it("PUT /profile/targets without profile returns 409 conflict", async () => {
    const res = await req("PUT", "/profile/targets", h2, {
      kcal: 2000,
      proteinG: 100,
      carbG: 200,
      fatG: 60,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "conflict" });
  });

  it("PUT /profile computes targets and GET returns them", async () => {
    const put = await req("PUT", "/profile", h1, valid);
    expect(put.statusCode).toBe(200);
    const body = put.json();
    expect(body.profile).toEqual({ ...valid, targetsOverridden: false });
    expect(body.targets.kcal).toBeGreaterThan(0);
    expect(body.floorKcal).toBeGreaterThanOrEqual(1500);
    expect(body.belowFloor).toBe(false);
    const get = await req("GET", "/profile", h1);
    expect(get.json()).toEqual(body);
  });

  it("PUT /profile/targets below floor sets belowFloor true and saves", async () => {
    const res = await req("PUT", "/profile/targets", h1, {
      kcal: 1000,
      proteinG: 100,
      carbG: 100,
      fatG: 30,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.belowFloor).toBe(true);
    expect(body.profile.targetsOverridden).toBe(true);
    expect(body.targets.kcal).toBe(1000);
    const get = await req("GET", "/profile", h1);
    expect(get.json().targets.kcal).toBe(1000);
  });

  it("PUT /profile/targets rejects out-of-range values with 400", async () => {
    const res = await req("PUT", "/profile/targets", h1, {
      kcal: 10001,
      proteinG: 1,
      carbG: 1,
      fatG: 1,
    });
    expect(res.statusCode).toBe(400);
  });

  it("PUT /profile/targets accepts 0 g of a macro", async () => {
    const res = await req("PUT", "/profile/targets", h1, {
      kcal: 1800,
      proteinG: 150,
      carbG: 0,
      fatG: 100,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().targets.carbG).toBe(0);
  });

  it("PUT /profile/targets rejects kcal 799 and grams 2001", async () => {
    const low = await req("PUT", "/profile/targets", h1, {
      kcal: 799,
      proteinG: 100,
      carbG: 100,
      fatG: 30,
    });
    expect(low.statusCode).toBe(400);
    const high = await req("PUT", "/profile/targets", h1, {
      kcal: 2000,
      proteinG: 100,
      carbG: 2001,
      fatG: 30,
    });
    expect(high.statusCode).toBe(400);
  });

  it("profile is isolated per session user", async () => {
    const mk = async (c: string) => ({
      authorization: `Bearer ${await issueSession(
        SECRET,
        (await syncUser(db, `U${c.repeat(32)}`, null)).userId,
      )}`,
    });
    const a = await mk("c");
    const b = await mk("d");
    const saved = (await req("PUT", "/profile", a, valid)).json();

    const otherGet = await req("GET", "/profile", b);
    expect(otherGet.json()).toEqual({
      profile: null,
      targets: null,
      floorKcal: null,
      belowFloor: false,
    });
    const otherPut = await req("PUT", "/profile/targets", b, {
      kcal: 2000,
      proteinG: 100,
      carbG: 200,
      fatG: 60,
    });
    expect(otherPut.statusCode).toBe(409);
    expect(otherPut.json()).toEqual({ error: "conflict" });

    const after = (await req("GET", "/profile", a)).json();
    expect(after).toEqual(saved);
    expect(after.profile.targetsOverridden).toBe(false);
  });
});
