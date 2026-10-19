import type { Exercise, Template } from "@gac/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { issueSession } from "../src/auth/session";
import { syncUser, type Db } from "../src/users/repo";
import {
  addItem,
  finishSession,
  listExercises,
  startSession,
  upsertSet,
} from "../src/workouts/repo";
import { createTestDb } from "./db";

const SECRET = new Uint8Array(32).fill(9);
const U1 = `U${"a".repeat(32)}`;
const U2 = `U${"b".repeat(32)}`;
const ZERO = "00000000-0000-4000-8000-000000000000";

describe("exercise and template routes", () => {
  let app: ReturnType<typeof buildApp>;
  let db: Db;
  let closeDb: () => Promise<void>;
  let id1: string;
  let id2: string;
  let h1: Record<string, string>;
  let h2: Record<string, string>;

  beforeAll(async () => {
    const t = await createTestDb();
    db = t.db;
    closeDb = t.close;
    id1 = (await syncUser(db, U1, null)).userId;
    id2 = (await syncUser(db, U2, null)).userId;
    h1 = { authorization: `Bearer ${await issueSession(SECRET, id1)}` };
    h2 = { authorization: `Bearer ${await issueSession(SECRET, id2)}` };
    const deps: AppDeps = {
      db,
      verifyServiceToken: async () => {
        throw new Error("unused");
      },
      botServiceAccount: "bot@x",
      verifyLineIdToken: async () => ({ sub: U1, name: null }),
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

  const list = async (headers: Record<string, string>, query = "") =>
    (
      await app.inject({ method: "GET", url: `/exercises${query}`, headers })
    ).json<Exercise[]>();
  const create = (headers: Record<string, string>, payload: object) =>
    app.inject({ method: "POST", url: "/exercises", headers, payload });

  it("routes need a session (401)", async () => {
    for (const [method, url] of [
      ["GET", "/exercises"],
      ["POST", "/exercises"],
      ["DELETE", `/exercises/${ZERO}`],
      ["GET", "/templates"],
      ["POST", "/templates"],
      ["DELETE", `/templates/${ZERO}`],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "unauthorized" });
    }
  });

  it("list exercises filters by q (zh and en), muscle, category and kind", async () => {
    const all = await list(h1);
    const bench = all.find((e) => e.slug === "barbell-bench-press");
    expect(bench).toBeDefined();
    const byEn = await list(h1, "?q=bench");
    expect(byEn.some((e) => e.slug === "barbell-bench-press")).toBe(true);
    const byZh = await list(h1, `?q=${encodeURIComponent(bench!.nameZh)}`);
    expect(byZh.some((e) => e.id === bench!.id)).toBe(true);
    const chest = await list(h1, "?muscle=chest");
    expect(chest.length).toBeGreaterThan(0);
    expect(chest.every((e) => e.muscleGroup === "chest")).toBe(true);
    const free = await list(h1, "?category=free_weight");
    expect(free.length).toBeGreaterThan(0);
    expect(free.every((e) => e.equipmentCategory === "free_weight")).toBe(true);
    const cardio = await list(h1, "?kind=cardio");
    expect(cardio.length).toBeGreaterThan(0);
    expect(cardio.every((e) => e.kind === "cardio")).toBe(true);
    const bad = await app.inject({
      method: "GET",
      url: "/exercises?muscle=nope",
      headers: h1,
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: "bad_request" });
  });

  it("create custom then list includes it only for owner", async () => {
    const res = await create(h1, {
      nameZh: "  自訂划船  ",
      kind: "strength",
      muscleGroup: "back",
      equipment: "cable",
    });
    expect(res.statusCode).toBe(201);
    const made = res.json<Exercise>();
    expect(made).toMatchObject({
      nameZh: "自訂划船",
      isCustom: true,
      equipmentCategory: "semi_machine",
    });
    expect((await list(h1)).some((e) => e.id === made.id)).toBe(true);
    expect((await list(h2)).some((e) => e.id === made.id)).toBe(false);
  });

  it("create validates kind, muscle and equipment combinations (400)", async () => {
    const bodies = [
      { nameZh: "x", kind: "strength", equipment: "barbell" },
      {
        nameZh: "x",
        kind: "strength",
        muscleGroup: "chest",
        equipment: "rower",
      },
      { nameZh: "x", kind: "cardio", muscleGroup: "core", equipment: "rower" },
      { nameZh: "x", kind: "cardio", equipment: "barbell" },
      { nameZh: "   ", kind: "cardio", equipment: "rower" },
      { nameZh: "a".repeat(31), kind: "cardio", equipment: "rower" },
      {
        nameZh: "x",
        nameEn: "a".repeat(61),
        kind: "cardio",
        equipment: "rower",
      },
    ];
    for (const b of bodies) {
      const res = await create(h1, b);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "bad_request" });
    }
    const ok = await create(h1, {
      nameZh: "划船機",
      nameEn: "Row",
      kind: "cardio",
      equipment: "rower",
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json<Exercise>().muscleGroup).toBeNull();
  });

  it("delete other user's exercise is 404", async () => {
    const made = (
      await create(h1, {
        nameZh: "我的",
        kind: "strength",
        muscleGroup: "core",
        equipment: "bodyweight",
      })
    ).json<Exercise>();
    const other = await app.inject({
      method: "DELETE",
      url: `/exercises/${made.id}`,
      headers: h2,
    });
    expect(other.statusCode).toBe(404);
    expect(other.json()).toEqual({ error: "not_found" });
    const seed = (await list(h1)).find((e) => !e.isCustom)!;
    const seedDel = await app.inject({
      method: "DELETE",
      url: `/exercises/${seed.id}`,
      headers: h1,
    });
    expect(seedDel.statusCode).toBe(404);
    const own = await app.inject({
      method: "DELETE",
      url: `/exercises/${made.id}`,
      headers: h1,
    });
    expect(own.statusCode).toBe(204);
    expect((await list(h1)).some((e) => e.id === made.id)).toBe(false);
  });

  it("delete archives a used custom exercise (204) and bad ids are 400", async () => {
    const made = (
      await create(h1, {
        nameZh: "用過",
        kind: "strength",
        muscleGroup: "core",
        equipment: "bodyweight",
      })
    ).json<Exercise>();
    const s = await startSession(db, id1, "2026-10-19");
    await addItem(db, id1, s.id, made.id);
    await upsertSet(db, id1, s.id, made.id, {
      setIndex: 1,
      weightKg: 0,
      reps: 10,
    });
    await finishSession(db, id1, s.id);
    const res = await app.inject({
      method: "DELETE",
      url: `/exercises/${made.id}`,
      headers: h1,
    });
    expect(res.statusCode).toBe(204);
    expect((await list(h1)).some((e) => e.id === made.id)).toBe(false);
    const bad = await app.inject({
      method: "DELETE",
      url: "/exercises/not-a-uuid",
      headers: h1,
    });
    expect(bad.statusCode).toBe(400);
  });

  describe("templates", () => {
    const post = (headers: Record<string, string>, payload: object) =>
      app.inject({ method: "POST", url: "/templates", headers, payload });

    async function finishedSession(): Promise<string> {
      const bench = (await listExercises(db, id1)).find(
        (e) => e.slug === "barbell-bench-press",
      )!;
      const s = await startSession(db, id1, "2026-10-20");
      await addItem(db, id1, s.id, bench.id);
      await upsertSet(db, id1, s.id, bench.id, {
        setIndex: 1,
        weightKg: 60,
        reps: 8,
      });
      await finishSession(db, id1, s.id);
      return s.id;
    }

    it("create template from own finished session", async () => {
      const sid = await finishedSession();
      const res = await post(h1, { fromSessionId: sid, name: " 推日 " });
      expect(res.statusCode).toBe(201);
      const tpl = res.json<Template>();
      expect(tpl.name).toBe("推日");
      expect(tpl.items).toHaveLength(1);
      const listed = await app.inject({
        method: "GET",
        url: "/templates",
        headers: h1,
      });
      expect(listed.json<Template[]>().some((t) => t.id === tpl.id)).toBe(true);
      const theirs = await app.inject({
        method: "GET",
        url: "/templates",
        headers: h2,
      });
      expect(theirs.json()).toEqual([]);
    });

    it("template from another user's session is 404", async () => {
      const sid = await finishedSession();
      const res = await post(h2, { fromSessionId: sid, name: "偷" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "not_found" });
    });

    it("template from an unfinished session is 409; bad input is 400", async () => {
      const s = await startSession(db, id2, "2026-10-20");
      const res = await post(h2, { fromSessionId: s.id, name: "未完成" });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ error: "conflict" });
      for (const b of [
        { fromSessionId: "x", name: "a" },
        { fromSessionId: s.id, name: "" },
        { fromSessionId: s.id, name: "   " },
        { fromSessionId: s.id, name: "a".repeat(31) },
      ]) {
        expect((await post(h2, b)).statusCode).toBe(400);
      }
    });

    it("delete template", async () => {
      const sid = await finishedSession();
      const tpl = (
        await post(h1, { fromSessionId: sid, name: "刪" })
      ).json<Template>();
      const other = await app.inject({
        method: "DELETE",
        url: `/templates/${tpl.id}`,
        headers: h2,
      });
      expect(other.statusCode).toBe(404);
      const own = await app.inject({
        method: "DELETE",
        url: `/templates/${tpl.id}`,
        headers: h1,
      });
      expect(own.statusCode).toBe(204);
      const again = await app.inject({
        method: "DELETE",
        url: `/templates/${tpl.id}`,
        headers: h1,
      });
      expect(again.statusCode).toBe(404);
      const bad = await app.inject({
        method: "DELETE",
        url: "/templates/zzz",
        headers: h1,
      });
      expect(bad.statusCode).toBe(400);
    });
  });
});
