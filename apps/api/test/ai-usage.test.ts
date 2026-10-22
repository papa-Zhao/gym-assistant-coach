import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { addAiTokens, releaseAiUse, reserveAiUse } from "../src/ai/usage";
import { aiUsageDaily, users } from "../src/db/schema";
import { syncUser } from "../src/users/repo";
import { createTestDb } from "./db";

const DAY = "2026-10-22";

describe("ai usage", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function setup() {
    const t = await createTestDb();
    close = t.close;
    const { userId } = await syncUser(t.db, "U1", "Amy");
    const rows = async (id = userId) =>
      t.db.select().from(aiUsageDaily).where(eq(aiUsageDaily.userId, id));
    return { ...t, userId, rows };
  }

  it("allows 20 text uses then refuses", async () => {
    const { db, userId, rows } = await setup();
    for (let i = 0; i < 20; i++) {
      expect(await reserveAiUse(db, userId, "text", DAY)).toBe(true);
    }
    expect(await reserveAiUse(db, userId, "text", DAY)).toBe(false);
    expect((await rows())[0]?.count).toBe(20);
  });

  it("grants exactly the limit under concurrent calls", async () => {
    const { db, userId, rows } = await setup();
    const results = await Promise.all(
      Array.from({ length: 25 }, () => reserveAiUse(db, userId, "text", DAY)),
    );
    expect(results.filter(Boolean)).toHaveLength(20);
    expect((await rows())[0]?.count).toBe(20);
  });

  it("counts each day and kind separately", async () => {
    const { db, userId } = await setup();
    for (let i = 0; i < 20; i++) await reserveAiUse(db, userId, "text", DAY);
    expect(await reserveAiUse(db, userId, "text", "2026-10-23")).toBe(true);
    expect(await reserveAiUse(db, userId, "chat", DAY)).toBe(true);
    expect(await reserveAiUse(db, userId, "text", DAY)).toBe(false);
  });

  it("release gives back one use and never goes below zero", async () => {
    const { db, userId, rows } = await setup();
    await reserveAiUse(db, userId, "text", DAY);
    await reserveAiUse(db, userId, "text", DAY);
    await releaseAiUse(db, userId, "text", DAY);
    expect((await rows())[0]?.count).toBe(1);
    await releaseAiUse(db, userId, "text", DAY);
    await releaseAiUse(db, userId, "text", DAY);
    expect((await rows())[0]?.count).toBe(0);
  });

  it("sums token usage across calls", async () => {
    const { db, userId, rows } = await setup();
    const usage = { input: 100, output: 20, cacheRead: 5, cacheCreation: 7 };
    await reserveAiUse(db, userId, "text", DAY);
    await addAiTokens(db, userId, "text", DAY, usage);
    await addAiTokens(db, userId, "text", DAY, usage);
    expect((await rows())[0]).toMatchObject({
      count: 1,
      inputTokens: 200,
      outputTokens: 40,
      cacheReadTokens: 10,
      cacheCreationTokens: 14,
    });
  });

  it("deletes usage rows with the user", async () => {
    const { db, userId, rows } = await setup();
    await reserveAiUse(db, userId, "text", DAY);
    await db.delete(users).where(eq(users.id, userId));
    expect(await rows()).toHaveLength(0);
  });
});
