import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { issueSession } from "../src/auth/session";
import { instrument, newDbStats, withDbStats } from "../src/db/timing.js";
import type { AppDeps } from "../src/deps.js";
import { syncUser } from "../src/users/repo";
import {
  createTestDb,
  unusedMealParser,
  unusedPhotoStore,
  unusedEquipmentIdentifier,
} from "./db";

const SECRET = new Uint8Array(32).fill(9);

describe("request timing", () => {
  it("timing log has route template, counts and no ids", async () => {
    const t = await createTestDb();
    const userId = (await syncUser(t.db, `U${"a".repeat(32)}`, null)).userId;
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const deps: AppDeps = {
      db: t.db,
      verifyServiceToken: async () => ({ email: "x@y" }),
      botServiceAccount: "bot@x",
      verifyLineIdToken: async () => ({ sub: "U", name: null }),
      notifyWorkoutFinished: async () => {},
      mealParser: unusedMealParser,
      equipmentIdentifier: unusedEquipmentIdentifier,
      photoStore: unusedPhotoStore,
      sessionSecret: SECRET,
      corsOrigin: "http://localhost",
      now: () => new Date("2026-10-19T04:00:00Z"),
      dbStats: () => ({ queries: 3, ms: 12.4 }),
    };
    const app = buildApp(deps, { logger: { level: "info", stream } });
    const token = await issueSession(SECRET, userId);
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const res = await app.inject({
      method: "DELETE",
      url: `/workouts/${sessionId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
    await t.close();

    const log = lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .find((l) => l.msg === "request timing");
    expect(log).toMatchObject({
      route: "/workouts/:id",
      method: "DELETE",
      status: 404,
      dbQueries: 3,
      dbMs: 12,
    });
    expect(typeof log?.ms).toBe("number");
    // Fastify's own request/response lines are separate; ours must be clean.
    const text = JSON.stringify(log);
    expect(text).not.toContain(sessionId);
    expect(text).not.toContain(token);
  });

  it("counts instrumented queries per request and ignores them without one", async () => {
    const run = (): Promise<unknown> => Promise.resolve("rows");
    // Like postgres.js, `.values()` hands back the same pending query.
    const pending = {
      then: (f: (v: unknown) => unknown) => run().then(f),
      values: () => pending,
    };
    const fake = {
      unsafe: () => pending,
      begin: (fn: (tx: unknown) => unknown) => Promise.resolve(fn(fake)),
    };
    const sql = instrument(fake as never) as unknown as typeof fake;
    await sql.unsafe(); // no request: must not throw
    const stats = newDbStats();
    await withDbStats(stats, async () => {
      await sql.unsafe();
      await sql.unsafe().values();
      await sql.begin(async (tx) => {
        await (tx as typeof fake).unsafe();
      });
    });
    expect(stats.queries).toBe(3);
    expect(stats.ms).toBeGreaterThanOrEqual(0);
  });
});
