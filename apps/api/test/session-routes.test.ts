import type {
  ActiveSession,
  Exercise,
  FinishSummary,
  WeekStats,
  WorkoutHistoryPage,
} from "@gac/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { issueSession } from "../src/auth/session";
import { createBotNotifier } from "../src/notify/bot.js";
import { syncUser, type Db } from "../src/users/repo";
import {
  createTestDb,
  unusedMealParser,
  unusedPhotoStore,
  unusedAdvisor,
  unusedEquipmentIdentifier,
  unusedWorkoutAdvisor,
} from "./db";

const SECRET = new Uint8Array(32).fill(9);
const U1 = `U${"a".repeat(32)}`;
const U2 = `U${"b".repeat(32)}`;
const ZERO = "00000000-0000-4000-8000-000000000000";

type Notify = AppDeps["notifyWorkoutFinished"];
let notify: Notify;
const calls: Parameters<Notify>[] = [];

describe("workout session routes", () => {
  let app: ReturnType<typeof buildApp>;
  let deps: AppDeps;
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
    deps = {
      db,
      verifyServiceToken: async () => {
        throw new Error("unused");
      },
      botServiceAccount: "bot@x",
      schedulerServiceAccount: "scheduler@x",
      verifyLineIdToken: async () => ({ sub: U1, name: null }),
      notifyWorkoutFinished: (...args) => notify(...args),
      mealParser: unusedMealParser,
      equipmentIdentifier: unusedEquipmentIdentifier,
      advisor: unusedAdvisor,
      workoutAdvisor: unusedWorkoutAdvisor,
      photoStore: unusedPhotoStore,
      sessionSecret: SECRET,
      corsOrigin: "http://localhost",
      now: () => new Date("2026-10-19T04:00:00Z"),
      notifyTimeoutMs: 50,
    };
    app = buildApp(deps);
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
  beforeEach(async () => {
    // A fresh app per test: this file makes more requests as one user than
    // the per-minute rate limit allows.
    await app.close();
    app = buildApp(deps);
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
      ["DELETE", `/workouts/${ZERO}`],
      ["GET", "/workouts/week"],
      ["GET", "/workouts/history"],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(401);
    }
  });

  it("rejects a bad before on /workouts/history (400)", async () => {
    const res = await req("GET", "/workouts/history?before=yesterday");
    expect(res.statusCode).toBe(400);
  });

  it("GET /workouts/history returns a page", async () => {
    await reset();
    const a = await start();
    await putSet(a.id, bench.id, 1, { restSec: 60 });
    await finish(a.id);
    const res = await req("GET", "/workouts/history");
    expect(res.statusCode).toBe(200);
    const page = res.json<WorkoutHistoryPage>();
    expect(page.entries[0]?.id).toBe(a.id);
    expect(page.entries[0]?.items[0]).toMatchObject({
      sets: [{ setIndex: 1, restSec: 60 }],
    });
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

  it("a notifier that outlives the deadline leaves no unhandled rejection", async () => {
    await reset();
    const seen: unknown[] = [];
    const onUnhandled = (reason: unknown) => seen.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const s = await start();
      await putSet(s.id, bench.id, 1);
      notify = () => new Promise<void>(() => {});
      const res = await finish(s.id);
      expect(res.statusCode).toBe(200);
      expect(res.json<FinishSummary>().notified).toBe(false);
      await new Promise((r) => setTimeout(r, 150));
      expect(seen).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("discard removes an active session with its records", async () => {
    await reset();
    const s = await start();
    await putSet(s.id, bench.id, 1);
    const res = await req("DELETE", `/workouts/${s.id}`);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
    const active = await req("GET", "/workouts/active");
    expect(active.json()).toBeNull();
    // gone for good: a second discard is not found
    expect((await req("DELETE", `/workouts/${s.id}`)).statusCode).toBe(404);
  });

  it("discard of a finished or foreign session is 404 and keeps it", async () => {
    await reset();
    const done = await start();
    await putSet(done.id, bench.id, 1);
    await finish(done.id);
    const finished = await req("DELETE", `/workouts/${done.id}`);
    expect(finished.statusCode).toBe(404);
    expect(finished.json()).toEqual({ error: "not_found" });

    const mine = await start();
    const foreign = await req("DELETE", `/workouts/${mine.id}`, h2);
    expect(foreign.statusCode).toBe(404);
    const active = await req("GET", "/workouts/active");
    expect(active.json<ActiveSession>().id).toBe(mine.id);
    expect((await req("DELETE", "/workouts/not-a-uuid")).statusCode).toBe(400);
  });

  it("delete item removes its sets and returns session", async () => {
    await reset();
    const s = await start();
    await putSet(s.id, bench.id, 1);
    await putSet(s.id, squat.id, 1);
    await req("PUT", `/workouts/${s.id}/cardio`, h1, {
      exerciseId: treadmill.id,
      entryIndex: 1,
      durationMin: 20,
    });
    const res = await req("DELETE", `/workouts/${s.id}/items/${bench.id}`);
    expect(res.statusCode).toBe(200);
    const out = res.json<ActiveSession>();
    expect(out.items.map((i) => i.exercise.id)).toEqual([
      squat.id,
      treadmill.id,
    ]);
    // cardio goes too, and nothing of the removed exercise is left behind
    const cardioOut = await req(
      "DELETE",
      `/workouts/${s.id}/items/${treadmill.id}`,
    );
    expect(cardioOut.json<ActiveSession>().items).toHaveLength(1);
    expect((await finish(s.id)).json<FinishSummary>().setCount).toBe(1);
    // not in the session: 404
    const again = await start();
    const missing = await req(
      "DELETE",
      `/workouts/${again.id}/items/${bench.id}`,
    );
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "not_found" });
  });

  it("delete item on finished or foreign session is 404", async () => {
    await reset();
    const done = await start();
    await putSet(done.id, bench.id, 1);
    await finish(done.id);
    const finished = await req(
      "DELETE",
      `/workouts/${done.id}/items/${bench.id}`,
    );
    expect(finished.statusCode).toBe(404);
    expect(finished.json()).toEqual({ error: "not_found" });

    const mine = await start();
    await putSet(mine.id, bench.id, 1);
    const foreign = await req(
      "DELETE",
      `/workouts/${mine.id}/items/${bench.id}`,
      h2,
    );
    expect(foreign.statusCode).toBe(404);
    const active = (await req("GET", "/workouts/active")).json<ActiveSession>();
    expect(active.items[0]?.exercise.id).toBe(bench.id);
    expect(
      (await req("DELETE", `/workouts/${mine.id}/items/nope`)).statusCode,
    ).toBe(400);
  });

  it("restSec stored and returned; out of range is 400", async () => {
    await reset();
    const s = await start();
    for (const bad of [{ restSec: -1 }, { restSec: 3601 }, { restSec: 1.5 }]) {
      const res = await putSet(s.id, bench.id, 1, bad);
      expect(res.statusCode, JSON.stringify(bad)).toBe(400);
    }
    const first = await putSet(s.id, bench.id, 1, { restSec: 90 });
    expect(first.json<ActiveSession>().items[0]).toMatchObject({
      sets: [{ setIndex: 1, restSec: 90 }],
    });
    // omitted on update keeps the stored value; no restSec on insert stays unset
    await putSet(s.id, bench.id, 2);
    const kept = await putSet(s.id, bench.id, 1, { reps: 9 });
    const sets = (kept.json<ActiveSession>().items[0] as { sets: object[] })
      .sets;
    expect(sets[0]).toMatchObject({ setIndex: 1, reps: 9, restSec: 90 });
    expect(sets[1]).not.toHaveProperty("restSec");
    const edge = await putSet(s.id, bench.id, 3, { restSec: 3600 });
    expect(edge.statusCode).toBe(200);
  });

  it("finish reports avgRestSec", async () => {
    await reset();
    const none = await start();
    await putSet(none.id, bench.id, 1);
    expect((await finish(none.id)).json<FinishSummary>().avgRestSec).toBeNull();

    const s = await start();
    await putSet(s.id, bench.id, 1);
    await putSet(s.id, bench.id, 2, { restSec: 60 });
    await putSet(s.id, bench.id, 3, { restSec: 91 });
    const summary = (await finish(s.id)).json<FinishSummary>();
    expect(summary.avgRestSec).toBe(76); // round(75.5)
  });

  it("completedAt returned for sets", async () => {
    await reset();
    const s = await start();
    const out = (await putSet(s.id, bench.id, 1)).json<ActiveSession>();
    const set = (out.items[0] as { sets: { completedAt: string }[] }).sets[0];
    expect(set?.completedAt).toBe(
      new Date(set?.completedAt ?? "").toISOString(),
    );
    expect(Date.now() - Date.parse(set?.completedAt ?? "")).toBeLessThan(
      60_000,
    );
  });

  it("editing a set keeps its completedAt and restSec", async () => {
    await reset();
    const s = await start();
    const created = (
      await putSet(s.id, bench.id, 1, { restSec: 75 })
    ).json<ActiveSession>();
    const before = (created.items[0] as { sets: { completedAt: string }[] })
      .sets[0]?.completedAt;
    await new Promise((r) => setTimeout(r, 20));
    const edited = (
      await putSet(s.id, bench.id, 1, { reps: 11 })
    ).json<ActiveSession>();
    expect((edited.items[0] as { sets: object[] }).sets[0]).toMatchObject({
      reps: 11,
      restSec: 75,
      completedAt: before,
    });
  });

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
