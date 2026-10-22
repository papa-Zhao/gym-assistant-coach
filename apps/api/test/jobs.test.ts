import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { appendExchange } from "../src/ask/repo";
import {
  aiConversations,
  aiMessages,
  aiUsageAnonymousDaily,
  aiUsageDaily,
  meals,
  users,
  workoutSessions,
} from "../src/db/schema";
import { DELETION_GRACE_DAYS, purgeDeletedUsers } from "../src/jobs/purge";
import { mealPhotoPrefix } from "../src/photos/store";
import { requestAccountDeletion, syncUser, type Db } from "../src/users/repo";
import {
  createTestDb,
  memoryPhotoStore,
  unusedAdvisor,
  unusedEquipmentIdentifier,
  unusedMealParser,
} from "./db";

// 04:00 in Taipei.
const NOW = new Date("2026-10-23T20:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

let n = 0;
const lineId = () => `U${(n++).toString(16).padStart(32, "0")}`;

async function newUser(db: Db, deletedAt?: Date): Promise<string> {
  const { userId } = await syncUser(db, lineId(), "X");
  if (deletedAt) await requestAccountDeletion(db, userId, deletedAt);
  return userId;
}

async function giveData(db: Db, userId: string, usageCount = 1) {
  await db
    .insert(workoutSessions)
    .values({ userId, performedOn: "2026-10-10", endedAt: ago(14 * DAY) });
  await db.insert(meals).values({
    userId,
    eatenOn: "2026-10-10",
    mealType: "lunch",
    status: "confirmed",
    source: "text",
  });
  await appendExchange(
    db,
    userId,
    "q",
    "a",
    { input: 1, output: 1 },
    ago(2 * DAY),
  );
  await db.insert(aiUsageDaily).values({
    userId,
    day: "2026-10-15",
    kind: "chat",
    count: usageCount,
    inputTokens: 100 * usageCount,
    outputTokens: 10 * usageCount,
  });
}

const exists = async (db: Db, userId: string) =>
  (await db.select().from(users).where(eq(users.id, userId))).length === 1;

describe("purgeDeletedUsers", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function newDb() {
    const t = await createTestDb();
    close = t.close;
    return t.db;
  }

  it("removes accounts deleted at least the grace period ago, nothing else", async () => {
    const db = await newDb();
    const photos = memoryPhotoStore();
    const due = await newUser(db, ago(DELETION_GRACE_DAYS * DAY));
    const early = await newUser(db, ago(DELETION_GRACE_DAYS * DAY - HOUR));
    const active = await newUser(db);
    const unfollowed = await newUser(db);
    // Even with an old deleted_at, only status 'deleted' counts.
    for (const [id, status] of [
      [active, "active"],
      [unfollowed, "unfollowed"],
    ] as const) {
      await db
        .update(users)
        .set({ status, deletedAt: ago(30 * DAY) })
        .where(eq(users.id, id));
    }

    expect(await purgeDeletedUsers(db, photos.store, NOW)).toBe(1);
    expect(await exists(db, due)).toBe(false);
    expect(await exists(db, early)).toBe(true);
    expect(await exists(db, active)).toBe(true);
    expect(await exists(db, unfollowed)).toBe(true);
  });

  it("removes the account's rows and photos, keeps other users'", async () => {
    const db = await newDb();
    const photos = memoryPhotoStore();
    const due = await newUser(db, ago(7 * DAY));
    const other = await newUser(db);
    await giveData(db, due);
    await giveData(db, other);
    photos.objects.set(`${mealPhotoPrefix(due)}a.jpg`, Buffer.from("x"));
    photos.objects.set(`${mealPhotoPrefix(due)}b.jpg`, Buffer.from("x"));
    photos.objects.set(`${mealPhotoPrefix(other)}c.jpg`, Buffer.from("x"));

    expect(await purgeDeletedUsers(db, photos.store, NOW)).toBe(1);
    expect(photos.calls.deletePrefix).toEqual([`meals/${due}/`]);
    expect([...photos.objects.keys()]).toEqual([
      `${mealPhotoPrefix(other)}c.jpg`,
    ]);
    for (const table of [workoutSessions, meals, aiConversations]) {
      const rows = await db.select({ userId: table.userId }).from(table);
      expect(rows.map((r) => r.userId)).toEqual([other]);
    }
    expect(await db.select().from(aiMessages)).toHaveLength(2);
    const usage = await db.select().from(aiUsageDaily);
    expect(usage.map((r) => r.userId)).toEqual([other]);
  });

  it("adds the account's usage into the anonymous totals", async () => {
    const db = await newDb();
    const photos = memoryPhotoStore();
    const due = await newUser(db, ago(7 * DAY));
    await giveData(db, due, 3);
    await db.insert(aiUsageDaily).values({
      userId: due,
      day: "2026-10-16",
      kind: "photo",
      count: 1,
    });
    await db.insert(aiUsageAnonymousDaily).values({
      day: "2026-10-15",
      kind: "chat",
      count: 5,
      inputTokens: 1,
    });

    await purgeDeletedUsers(db, photos.store, NOW);
    const rows = await db
      .select()
      .from(aiUsageAnonymousDaily)
      .orderBy(aiUsageAnonymousDaily.day);
    expect(rows).toEqual([
      {
        day: "2026-10-15",
        kind: "chat",
        count: 8,
        inputTokens: 301,
        outputTokens: 30,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
      {
        day: "2026-10-16",
        kind: "photo",
        count: 1,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    ]);
  });

  it("keeps an account whose photos could not be deleted", async () => {
    const db = await newDb();
    const photos = memoryPhotoStore();
    const stuck = await newUser(db, ago(8 * DAY));
    const fine = await newUser(db, ago(7 * DAY));
    await giveData(db, stuck);
    await giveData(db, fine);
    photos.fail.deletePrefix.add(mealPhotoPrefix(stuck));
    const warnings: object[] = [];
    const log = { warn: (fields: object) => void warnings.push(fields) };

    expect(await purgeDeletedUsers(db, photos.store, NOW, log)).toBe(1);
    expect(await exists(db, stuck)).toBe(true);
    expect(await exists(db, fine)).toBe(false);
    const usage = await db.select().from(aiUsageDaily);
    expect(usage.map((r) => r.userId)).toEqual([stuck]);
    const anon = await db.select().from(aiUsageAnonymousDaily);
    expect(anon.map((r) => r.count)).toEqual([1]);
    // Only the error class name, never the user id.
    expect(JSON.stringify(warnings)).toContain("TypeError");
    expect(JSON.stringify(warnings)).not.toContain(stuck);
  });

  it("removes at most 100 per run, oldest deletion first", async () => {
    const db = await newDb();
    const photos = memoryPhotoStore();
    const ids: string[] = [];
    // ids[0] was deleted most recently.
    for (let i = 0; i < 101; i++) {
      ids.push(await newUser(db, ago(10 * DAY + i * HOUR)));
    }
    expect(await purgeDeletedUsers(db, photos.store, NOW)).toBe(100);
    const left = await db.select({ id: users.id }).from(users);
    expect(left.map((r) => r.id)).toEqual([ids[0]]);
  });
});

describe("POST /jobs/daily", () => {
  const BOT = "bot-runtime@x.iam.gserviceaccount.com";
  const SCHEDULER = "scheduler-invoker@x.iam.gserviceaccount.com";

  async function build() {
    const t = await createTestDb();
    const photos = memoryPhotoStore();
    const lines: string[] = [];
    const deps: AppDeps = {
      db: t.db,
      verifyServiceToken: async (token) => {
        if (token === "scheduler") return { email: SCHEDULER };
        if (token === "bot") return { email: BOT };
        throw new Error("invalid token");
      },
      botServiceAccount: BOT,
      schedulerServiceAccount: SCHEDULER,
      verifyLineIdToken: async () => {
        throw new Error("unused");
      },
      notifyWorkoutFinished: async () => {},
      mealParser: unusedMealParser,
      equipmentIdentifier: unusedEquipmentIdentifier,
      advisor: unusedAdvisor,
      photoStore: photos.store,
      sessionSecret: new Uint8Array(32).fill(7),
      corsOrigin: "https://liff.example",
      now: () => NOW,
    };
    const app = buildApp(deps, {
      logger: {
        level: "info",
        stream: { write: (l: string) => void lines.push(l) },
      },
    });
    return {
      app,
      db: t.db,
      lines,
      close: async () => {
        await app.close();
        await t.close();
      },
    };
  }

  it("runs the purge for the scheduler's token", async () => {
    const { app, db, lines, close } = await build();
    try {
      const due = await newUser(db, ago(7 * DAY));
      const keep = await newUser(db);
      await appendExchange(
        db,
        keep,
        "舊問題",
        "舊回答",
        { input: 1, output: 1 },
        ago(91 * DAY),
      );
      const res = await app.inject({
        method: "POST",
        url: "/jobs/daily",
        headers: { authorization: "Bearer scheduler" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ deletedUsers: 1 });
      expect(await exists(db, due)).toBe(false);
      expect(await db.select().from(aiMessages)).toEqual([]);
      const logs = lines.join("");
      expect(logs).toContain('"event":"daily_job"');
      expect(logs).not.toContain(due);
    } finally {
      await close();
    }
  });

  it("accepts an empty octet-stream body", async () => {
    const { app, close } = await build();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/jobs/daily",
        headers: {
          authorization: "Bearer scheduler",
          "content-type": "application/octet-stream",
        },
        payload: "",
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await close();
    }
  });

  it("rejects the bot's token and a missing token", async () => {
    const { app, close } = await build();
    try {
      for (const headers of [{ authorization: "Bearer bot" }, {}]) {
        const res = await app.inject({
          method: "POST",
          url: "/jobs/daily",
          headers,
        });
        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual({ error: "unauthorized" });
      }
    } finally {
      await close();
    }
  });
});
