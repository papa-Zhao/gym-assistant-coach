import { AI_DAILY_LIMITS } from "@gac/shared";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Advisor, AdvisorResult } from "../src/ai/advisor";
import { AiUnavailable } from "../src/ai/structured-call";
import { adviceText } from "../src/ask/advice";
import { appendExchange } from "../src/ask/repo";
import { askCoach } from "../src/ask/service";
import { aiMessages, aiUsageDaily } from "../src/db/schema";
import { saveProfile } from "../src/profile/repo";
import { syncUser, type Db } from "../src/users/repo";
import { createTestDb } from "./db";

const NOW = new Date("2026-10-22T04:00:00Z");
const usage = { input: 100, output: 20, cacheRead: 0, cacheCreation: 0 };
const okResult: AdvisorResult = {
  kind: "ok",
  advice: {
    title: "晚餐建議",
    items: [{ name: "雞胸肉", detail: "150 g" }],
    body: "多吃蛋白質。",
    program: [],
  },
  usage,
};

describe("askCoach", () => {
  let db: Db;
  let close: () => Promise<void>;
  let userId: string;
  let calls: Parameters<Advisor["ask"]>[0][];
  let next: () => Promise<AdvisorResult>;
  const deps = () => ({
    db,
    now: () => NOW,
    advisor: {
      ask: async (input) => {
        calls.push(input);
        return next();
      },
    } satisfies Advisor,
  });

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    userId = (await syncUser(db, "Ua", "A")).userId;
    await saveProfile(
      db,
      userId,
      {
        sex: "male",
        birthYear: 1992,
        heightCm: 175,
        weightKg: 72.5,
        activityLevel: "moderate",
        goal: "cut",
      },
      "2026-10-22",
    );
    calls = [];
    next = async () => okResult;
  });
  afterEach(() => close());

  const usageRow = async () =>
    (
      await db
        .select()
        .from(aiUsageDaily)
        .where(
          and(eq(aiUsageDaily.userId, userId), eq(aiUsageDaily.kind, "chat")),
        )
    )[0];
  const messageCount = async () => (await db.select().from(aiMessages)).length;

  it("answers, records usage and stores the exchange", async () => {
    const res = await askCoach(deps(), userId, "晚餐吃什麼？");
    expect(res.outcome).toBe("answer");
    if (res.outcome !== "answer") return;
    expect(res.advice.title).toBe("晚餐建議");
    expect(res.advice.todayLine).toMatch(/^今天/);
    const row = await usageRow();
    expect(row).toMatchObject({ count: 1, inputTokens: 100, outputTokens: 20 });
    expect(await messageCount()).toBe(2);
  });

  it("sends the previous exchange as history and the context first", async () => {
    const first = await askCoach(deps(), userId, "晚餐吃什麼？");
    await askCoach(deps(), userId, "那宵夜呢？");
    if (first.outcome !== "answer") throw new Error("expected answer");
    expect(calls[0]?.history).toEqual([]);
    expect(calls[1]?.history).toEqual([
      { role: "user", content: "晚餐吃什麼？" },
      { role: "assistant", content: adviceText(first.advice) },
    ]);
    expect(calls[1]?.context.startsWith("使用者資料：")).toBe(true);
    expect(calls[1]?.question).toBe("那宵夜呢？");
  });

  it("returns limit without calling the advisor", async () => {
    await db.insert(aiUsageDaily).values({
      userId,
      day: "2026-10-22",
      kind: "chat",
      count: AI_DAILY_LIMITS.chat,
    });
    expect(await askCoach(deps(), userId, "嗨")).toEqual({ outcome: "limit" });
    expect(calls).toHaveLength(0);
  });

  it("returns unavailable, gives the use back and stores nothing", async () => {
    next = async () => {
      throw new AiUnavailable();
    };
    expect(await askCoach(deps(), userId, "嗨")).toEqual({
      outcome: "unavailable",
    });
    expect((await usageRow())?.count).toBe(0);
    expect(await messageCount()).toBe(0);
  });

  it.each([
    ["refused", { outcome: "refused" }],
    ["invalid", { outcome: "unavailable" }],
  ] as const)("%s counts as a use and stores nothing", async (kind, out) => {
    next = async () => ({ kind, usage });
    expect(await askCoach(deps(), userId, "嗨")).toEqual(out);
    expect((await usageRow())?.count).toBe(1);
    expect(await messageCount()).toBe(0);
  });

  it("purges messages older than 90 days", async () => {
    await appendExchange(
      db,
      userId,
      "舊問題",
      "舊回答",
      { input: 1, output: 1 },
      new Date(NOW.getTime() - 91 * 86_400_000),
    );
    await askCoach(deps(), userId, "新問題");
    const rows = await db.select().from(aiMessages);
    expect(rows.map((r) => r.content)).not.toContain("舊問題");
    expect(rows).toHaveLength(2);
  });
});
