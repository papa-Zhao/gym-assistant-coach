import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendExchange,
  endConversation,
  purgeExpiredMessages,
  recentTurns,
} from "../src/ask/repo";
import { aiConversations, aiMessages } from "../src/db/schema";
import { syncUser, type Db } from "../src/users/repo";
import { createTestDb } from "./db";

const usage = { input: 10, output: 5 };
const NOW = new Date("2026-10-22T04:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("ask repo", () => {
  let db: Db;
  let close: () => Promise<void>;
  let userA: string;
  let userB: string;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    userA = (await syncUser(db, "Ua", "A")).userId;
    userB = (await syncUser(db, "Ub", "B")).userId;
  });
  afterEach(() => close());

  it("returns turns oldest first", async () => {
    await appendExchange(db, userA, "q1", "a1", usage, daysAgo(1));
    await appendExchange(db, userA, "q2", "a2", usage, NOW);
    expect(await recentTurns(db, userA, NOW)).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
      { role: "assistant", content: "a2" },
    ]);
  });

  it("returns only the last 10 messages, starting with a user turn", async () => {
    for (let i = 1; i <= 6; i++) {
      await appendExchange(
        db,
        userA,
        `q${i}`,
        `a${i}`,
        usage,
        new Date(NOW.getTime() + i * 1000),
      );
    }
    const turns = await recentTurns(db, userA, NOW);
    expect(turns).toHaveLength(10);
    expect(turns[0]).toEqual({ role: "user", content: "q2" });
    expect(turns[9]).toEqual({ role: "assistant", content: "a6" });
  });

  it("stores tokens on the assistant message only", async () => {
    await appendExchange(db, userA, "q", "a", usage, NOW);
    const rows = await db.select().from(aiMessages);
    const byRole = Object.fromEntries(rows.map((r) => [r.role, r]));
    expect(byRole.user!.inputTokens).toBeNull();
    expect(byRole.user!.outputTokens).toBeNull();
    expect(byRole.assistant!.inputTokens).toBe(10);
    expect(byRole.assistant!.outputTokens).toBe(5);
  });

  it("endConversation clears history and next exchange starts a new one", async () => {
    await appendExchange(db, userA, "old", "old-a", usage, NOW);
    await endConversation(db, userA, NOW);
    expect(await recentTurns(db, userA, NOW)).toEqual([]);
    await appendExchange(db, userA, "new", "new-a", usage, NOW);
    expect(await recentTurns(db, userA, NOW)).toEqual([
      { role: "user", content: "new" },
      { role: "assistant", content: "new-a" },
    ]);
    expect(await db.select().from(aiConversations)).toHaveLength(2);
  });

  it("endConversation is a no-op without a conversation", async () => {
    await expect(endConversation(db, userA, NOW)).resolves.toBeUndefined();
  });

  it("hides messages older than 90 days and purges them", async () => {
    await appendExchange(db, userA, "q91", "a91", usage, daysAgo(91));
    await appendExchange(db, userA, "q89", "a89", usage, daysAgo(89));
    expect((await recentTurns(db, userA, NOW)).map((t) => t.content)).toEqual([
      "q89",
      "a89",
    ]);
    await purgeExpiredMessages(db, NOW);
    const rows = await db.select().from(aiMessages);
    expect(rows.map((r) => r.content).sort()).toEqual(["a89", "q89"]);
  });

  it("purge removes ended conversations left empty but keeps active and non-empty ones", async () => {
    await appendExchange(db, userA, "old", "old", usage, daysAgo(100));
    await endConversation(db, userA, daysAgo(99));
    await appendExchange(db, userA, "fresh", "fresh", usage, daysAgo(1));
    await endConversation(db, userA, daysAgo(1));
    await appendExchange(db, userB, "b", "b", usage, daysAgo(120));
    await purgeExpiredMessages(db, NOW);
    const convs = await db.select().from(aiConversations);
    // userA's fresh ended conv and userB's active (now empty) conv remain.
    expect(convs).toHaveLength(2);
    expect(convs.filter((c) => c.endedAt === null)).toHaveLength(1);
    expect(await db.select().from(aiMessages)).toHaveLength(2);
  });

  it("keeps users separate", async () => {
    await appendExchange(db, userA, "qa", "aa", usage, NOW);
    await appendExchange(db, userB, "qb", "ab", usage, NOW);
    await endConversation(db, userA, NOW);
    expect(await recentTurns(db, userA, NOW)).toEqual([]);
    expect((await recentTurns(db, userB, NOW)).map((t) => t.content)).toEqual([
      "qb",
      "ab",
    ]);
  });

  it("concurrent exchanges share one active conversation", async () => {
    await Promise.all([
      appendExchange(db, userA, "q1", "a1", usage, NOW),
      appendExchange(db, userA, "q2", "a2", usage, NOW),
    ]);
    const convs = await db.select().from(aiConversations);
    expect(convs.filter((c) => c.endedAt === null)).toHaveLength(1);
    expect(await recentTurns(db, userA, NOW)).toHaveLength(4);
  });
});
