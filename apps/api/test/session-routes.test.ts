import type {
  ActiveSession,
  Exercise,
  FinishSummary,
  WeekStats,
} from "@gac/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { issueSession } from "../src/auth/session";
import { createBotNotifier } from "../src/notify/bot.js";
import { syncUser, type Db } from "../src/users/repo";
import { createTestDb } from "./db";

const SECRET = new Uint8Array(32).fill(9);
const U1 = `U${"a".repeat(32)}`;
const U2 = `U${"b".repeat(32)}`;
const ZERO = "00000000-0000-4000-8000-000000000000";

type Notify = AppDeps["notifyWorkoutFinished"];
let notify: Notify;
const calls: Parameters<Notify>[] = [];

describe("workout session routes", () => {
  let app: ReturnType<typeof buildApp>;
  let db: Db;
  let closeDb: () => Promise<void>;
  let h1: Record<string, string>;
  let h2: Record<string, string>;
  let bench: Exercise;
  let squat: Exercise;
  let treadmill: Exercise;

  beforeAll(async () => {
    const t = await createTestDb();
    db = t.db;
    closeDb = t.close;
    const id1 = (await syncUser(db, U1, null)).userId;
    const id2 = (await syncUser(db, U2, null)).userId;
    h1 = { authorization: `Bearer ${await issueSession(SECRET, id1)}` };
    h2 = { authorization: `Bearer ${await issueSession(SECRET, id2)}` };
    app = buildApp({
      db,
      verifyServiceToken: async () => {
        throw new Error("unused");
      },
      botServiceAccount: "bot@x",
      verifyLineIdToken: async () => ({ sub: U1, name: null }),
      notifyWorkoutFinished: (...args) => notify(...args),
      sessionSecret: SECRET,
      corsOrigin: "http://localhost",
      now: () => new Date("2026-10-19T04:00:00Z"),
    });
    const all = (
      await app.inject({ method: "GET", url: "/exercises", headers: h1 })
    ).json<Exercise[]>();
    const find = (slug: string) => {
      const e = all.find((x) => x.slug === slug);
      if (!e) throw new Error(`missing seed ${slug}`);
      return e;
    };
    bench = find("barbell-bench-press");
    squat = find("barbell-back-squat");
    treadmill = all.find(
      (x) => x.kind === "cardio" && x.equipment === "treadmill",
    ) as Exercise;
  });
  afterAll(async () => {
    await app.close();
    await closeDb();
  });
  beforeEach(() => {
    calls.length = 0;
    notify = async (...args) => {
      calls.push(args);
    };
  });

  const req = (
    method: "GET" | "POST" | "PUT" | "DELETE",
    url: string,
    headers = h1,
    payload?: object,
  ) =>
    app.inject({
      method,
      url,
      headers,
      ...(payload === undefined ? {} : { payload }),
    });
  const start = async (headers = h1) =>
    (await req("POST", "/workouts", headers, {})).json<ActiveSession>();
  const putSet = (
    id: string,
    exerciseId: string,
    setIndex: number,
    extra: object = {},
    headers = h1,
  ) =>
    req("PUT", `/workouts/${id}/sets`, headers, {
      exerciseId,
      setIndex,
      reps: 8,
      weightKg: 60,
      ...extra,
    });
  const finish = (id: string, headers = h1) =>
    req("POST", `/workouts/${id}/finish`, headers);
  /** Finishes whatever is in progress for the user so tests stay independent. */
  const reset = async (headers = h1) => {
    const a = (
      await req("GET", "/workouts/active", headers)
    ).json<ActiveSession | null>();
    if (a) {
      await putSet(a.id, bench.id, 1, {}, headers);
      await finish(a.id, headers);
      calls.length = 0;
    }
  };

  it("requires a session (401)", async () => {
    for (const [method, url] of [
      ["GET", "/workouts/active"],
      ["POST", "/workouts"],
      ["POST", `/workouts/${ZERO}/items`],
      ["PUT", `/workouts/${ZERO}/sets`],
      ["DELETE", `/workouts/${ZERO}/sets/${ZERO}/1`],
      ["PUT", `/workouts/${ZERO}/cardio`],
      ["DELETE", `/workouts/${ZERO}/cardio/${ZERO}/1`],
      ["POST", `/workouts/${ZERO}/finish`],
      ["GET", "/workouts/week"],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(401);
    }
  });

  it("start, add item, record sets, finish returns PRs", async () => {
    await reset();
    // an earlier, lighter session so a PR is possible
    const first = await start();
    await putSet(first.id, bench.id, 1, { weightKg: 50 });
    await finish(first.id);

    const s = await start();
    expect(s.date).toBe("2026-10-19");
    const added = await req("POST", `/workouts/${s.id}/items`, h1, {
      exerciseId: bench.id,
    });
    expect(added.statusCode).toBe(200);
    // adding the same exercise again does not duplicate it
    const again = (
      await req("POST", `/workouts/${s.id}/items`, h1, { exerciseId: bench.id })
    ).json<ActiveSession>();
    expect(again.items).toHaveLength(1);

    const after = await putSet(s.id, bench.id, 1, {
      weightKg: 80,
      reps: 5,
      rpe: 8.5,
    });
    expect(after.statusCode).toBe(200);
    await putSet(s.id, bench.id, 2, { weightKg: 80, reps: 5 });
    const del = await req("DELETE", `/workouts/${s.id}/sets/${bench.id}/2`);
    expect(del.statusCode).toBe(200);
    expect(
      (del.json<ActiveSession>().items[0] as { sets: unknown[] }).sets,
    ).toHaveLength(1);

    const res = await finish(s.id);
    expect(res.statusCode).toBe(200);
    const sum = res.json<FinishSummary>();
    expect(sum).toMatchObject({
      sessionId: s.id,
      volumeKg: 400,
      exerciseCount: 1,
      setCount: 1,
      cardioMinutes: 0,
      notified: true,
    });
    expect(sum.prs).toHaveLength(1);
    expect(sum.prs[0]).toMatchObject({
      exerciseId: bench.id,
      weightKg: 80,
      reps: 5,
    });
  });

  it("starting again returns the same active session", async () => {
    await reset();
    const a = await start();
    const b = await start();
    expect(b.id).toBe(a.id);
    const c = (await req("POST", "/workouts", h1)).json<ActiveSession>();
    expect(c.id).toBe(a.id);
  });

  it("reopen returns recorded sets", async () => {
    await reset();
    const s = await start();
    await putSet(s.id, squat.id, 1, { weightKg: 100, reps: 5 });
    const active = (await req("GET", "/workouts/active")).json<ActiveSession>();
    expect(active.id).toBe(s.id);
    expect(active.items[0]).toMatchObject({
      exercise: { id: squat.id },
      sets: [{ setIndex: 1, weightKg: 100, reps: 5 }],
    });
  });

  it("set out of range is 400", async () => {
    await reset();
    const s = await start();
    for (const bad of [
      { reps: 0 },
      { reps: 101 },
      { reps: 5.5 },
      { weightKg: -1 },
      { weightKg: 501 },
      { weightKg: 60.25 },
      { rpe: 0.5 },
      { rpe: 11 },
      { rpe: 7.25 },
      { setIndex: 0 },
      { exerciseId: "nope" },
    ]) {
      const res = await putSet(s.id, bench.id, 1, bad);
      expect(res.statusCode, JSON.stringify(bad)).toBe(400);
      expect(res.json()).toEqual({ error: "bad_request" });
    }
    expect((await putSet("nope", bench.id, 1)).statusCode).toBe(400);
    expect(
      (await putSet(s.id, bench.id, 1, { weightKg: 0, rpe: 7.5 })).statusCode,
    ).toBe(200);
  });

  it("finish with no sets is 409", async () => {
    await reset();
    const s = await start();
    await req("POST", `/workouts/${s.id}/items`, h1, { exerciseId: bench.id });
    const res = await finish(s.id);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "conflict" });
    expect(calls).toHaveLength(0);
    // still in progress
    expect(
      (await req("GET", "/workouts/active")).json<ActiveSession>().id,
    ).toBe(s.id);
  });

  it("other user's session is 404", async () => {
    await reset();
    const s = await start();
    await putSet(s.id, bench.id, 1);
    for (const res of [
      await req("POST", `/workouts/${s.id}/items`, h2, {
        exerciseId: bench.id,
      }),
      await putSet(s.id, bench.id, 1, {}, h2),
      await req("DELETE", `/workouts/${s.id}/sets/${bench.id}/1`, h2),
      await req("PUT", `/workouts/${s.id}/cardio`, h2, {
        exerciseId: treadmill.id,
        entryIndex: 1,
        durationMin: 10,
      }),
      await req("DELETE", `/workouts/${s.id}/cardio/${treadmill.id}/1`, h2),
      await finish(s.id, h2),
    ]) {
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "not_found" });
    }
    expect((await req("GET", "/workouts/active", h2)).json()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("week stats after finish", async () => {
    await reset();
    const s = await start();
    await putSet(s.id, bench.id, 1);
    await putSet(s.id, bench.id, 2);
    await finish(s.id);
    const res = await req("GET", "/workouts/week");
    expect(res.statusCode).toBe(200);
    const w = res.json<WeekStats>();
    expect(w.from).toBe("2026-10-19");
    expect(w.to).toBe("2026-10-25");
    expect(w.setsByMuscle.chest).toBeGreaterThanOrEqual(2);
    const empty = (await req("GET", "/workouts/week", h2)).json<WeekStats>();
    expect(empty).toMatchObject({ sessions: 0, cardioMinutes: 0 });
  });

  it("cardio entry recorded, out-of-range is 400, wrong kind is 400", async () => {
    await reset();
    const s = await start();
    const ok = await req("PUT", `/workouts/${s.id}/cardio`, h1, {
      exerciseId: treadmill.id,
      entryIndex: 1,
      durationMin: 30,
      distanceKm: 5.25,
      inclinePct: 2.5,
      speedKmh: 9.5,
    });
    expect(ok.statusCode).toBe(200);
    expect(
      (ok.json<ActiveSession>().items[0] as { cardio: unknown[] }).cardio,
    ).toHaveLength(1);
    for (const bad of [
      { durationMin: 0 },
      { durationMin: 601 },
      { durationMin: 10.5 },
      { distanceKm: 101 },
      { distanceKm: 1.234 },
      { inclinePct: 41 },
      { inclinePct: 1.25 },
      { speedKmh: 40.5 },
      { level: 31 },
      { level: 0 },
    ]) {
      const res = await req("PUT", `/workouts/${s.id}/cardio`, h1, {
        exerciseId: treadmill.id,
        entryIndex: 1,
        durationMin: 10,
        ...bad,
      });
      expect(res.statusCode, JSON.stringify(bad)).toBe(400);
    }
    const wrong = await req("PUT", `/workouts/${s.id}/cardio`, h1, {
      exerciseId: bench.id,
      entryIndex: 1,
      durationMin: 10,
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json()).toEqual({ error: "bad_request" });
    const wrongSet = await putSet(s.id, treadmill.id, 1);
    expect(wrongSet.statusCode).toBe(400);
    const del = await req(
      "DELETE",
      `/workouts/${s.id}/cardio/${treadmill.id}/1`,
    );
    expect(del.statusCode).toBe(200);
  });

  it("finish with only cardio succeeds and reports cardio minutes", async () => {
    await reset();
    const s = await start();
    await req("PUT", `/workouts/${s.id}/cardio`, h1, {
      exerciseId: treadmill.id,
      entryIndex: 1,
      durationMin: 25,
    });
    const res = await finish(s.id);
    expect(res.statusCode).toBe(200);
    expect(res.json<FinishSummary>()).toMatchObject({
      setCount: 0,
      volumeKg: 0,
      cardioMinutes: 25,
      exerciseCount: 1,
    });
  });

  it("finish notifies bot with summary and sets notified true", async () => {
    await reset();
    const s = await start();
    await putSet(s.id, bench.id, 1);
    const res = await finish(s.id);
    expect(res.json<FinishSummary>().notified).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe(U1);
    expect(calls[0]?.[1]).toMatchObject({ sessionId: s.id, setCount: 1 });
    expect(calls[0]?.[2]).toBeNull();
  });

  it("notifier failure or timeout still finishes with notified false", async () => {
    await reset();
    const s1 = await start();
    await putSet(s1.id, bench.id, 1);
    notify = async () => {
      throw new Error("secret-detail");
    };
    const r1 = await finish(s1.id);
    expect(r1.statusCode).toBe(200);
    expect(r1.json<FinishSummary>().notified).toBe(false);

    const s2 = await start();
    await putSet(s2.id, bench.id, 1);
    notify = () => new Promise<void>(() => {});
    const r2 = await finish(s2.id);
    expect(r2.statusCode).toBe(200);
    expect(r2.json<FinishSummary>().notified).toBe(false);
  }, 15000);

  it("finishing an already finished session is 409 and does not notify again", async () => {
    await reset();
    const s = await start();
    await putSet(s.id, bench.id, 1);
    expect((await finish(s.id)).statusCode).toBe(200);
    expect(calls).toHaveLength(1);
    const again = await finish(s.id);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: "conflict" });
    expect(calls).toHaveLength(1);
    // editing a finished session is also a conflict
    expect((await putSet(s.id, bench.id, 2)).statusCode).toBe(409);
  });
});

describe("createBotNotifier", () => {
  const summary = { sessionId: "s", notified: false } as FinishSummary;

  it("posts with ID token and rejects non-2xx", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    let status = 204;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(status === 204 ? null : "TOKEN-LEAK body", {
        status,
      });
    }) as unknown as typeof fetch;
    const notifier = createBotNotifier("https://bot.example.run.app", "aud", {
      fetchImpl,
      getIdToken: async (aud) => `tok-for-${aud}`,
    });
    await notifier(U1, summary, "推日");
    expect(seen?.url).toBe(
      "https://bot.example.run.app/internal/notify/workout-finished",
    );
    expect(seen?.init.method).toBe("POST");
    expect(seen?.init.headers).toMatchObject({
      authorization: "Bearer tok-for-aud",
    });
    expect(seen?.init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(seen?.init.body as string)).toEqual({
      lineUserId: U1,
      summary,
      templateName: "推日",
    });
    for (status of [401, 400, 502]) {
      const err = await notifier(U1, summary, null).catch((e: Error) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).not.toContain("TOKEN-LEAK");
      expect((err as Error).message).not.toContain("tok-for-aud");
    }
  });
});
