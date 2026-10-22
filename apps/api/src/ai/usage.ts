import { AI_DAILY_LIMITS, taipeiDate, type AiKind } from "@gac/shared";
import { and, eq, sql } from "drizzle-orm";
import { aiUsageDaily } from "../db/schema";
import type { Db } from "../users/repo";
import { AiUnavailable } from "./structured-call";

export interface AiTokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

/** Atomically adds one use if under the limit. Returns false when the limit is reached. */
export async function reserveAiUse(
  db: Db,
  userId: string,
  kind: AiKind,
  day: string,
): Promise<boolean> {
  const limit = AI_DAILY_LIMITS[kind];
  const rows = await db
    .insert(aiUsageDaily)
    .values({ userId, day, kind, count: 1 })
    .onConflictDoUpdate({
      target: [aiUsageDaily.userId, aiUsageDaily.day, aiUsageDaily.kind],
      set: { count: sql`${aiUsageDaily.count} + 1` },
      setWhere: sql`${aiUsageDaily.count} < ${limit}`,
    })
    .returning({ count: aiUsageDaily.count });
  return rows.length > 0;
}

/** Gives back one reserved use (AI service failure). Never goes below 0. */
export async function releaseAiUse(
  db: Db,
  userId: string,
  kind: AiKind,
  day: string,
): Promise<void> {
  await db
    .update(aiUsageDaily)
    .set({ count: sql`greatest(${aiUsageDaily.count} - 1, 0)` })
    .where(rowKey(userId, kind, day));
}

export async function addAiTokens(
  db: Db,
  userId: string,
  kind: AiKind,
  day: string,
  usage: AiTokenUsage,
): Promise<void> {
  await db
    .insert(aiUsageDaily)
    .values({
      userId,
      day,
      kind,
      count: 0,
      inputTokens: usage.input,
      outputTokens: usage.output,
      cacheReadTokens: usage.cacheRead,
      cacheCreationTokens: usage.cacheCreation,
    })
    .onConflictDoUpdate({
      target: [aiUsageDaily.userId, aiUsageDaily.day, aiUsageDaily.kind],
      set: {
        inputTokens: sql`${aiUsageDaily.inputTokens} + ${usage.input}`,
        outputTokens: sql`${aiUsageDaily.outputTokens} + ${usage.output}`,
        cacheReadTokens: sql`${aiUsageDaily.cacheReadTokens} + ${usage.cacheRead}`,
        cacheCreationTokens: sql`${aiUsageDaily.cacheCreationTokens} + ${usage.cacheCreation}`,
      },
    });
}

function rowKey(userId: string, kind: AiKind, day: string) {
  return and(
    eq(aiUsageDaily.userId, userId),
    eq(aiUsageDaily.day, day),
    eq(aiUsageDaily.kind, kind),
  );
}

export type AiUseOutcome<T> =
  { kind: "limit" } | { kind: "unavailable" } | { kind: "done"; result: T };

/**
 * Reserve a use, run the AI call, record its tokens. An AiUnavailable gives
 * the use back; any other error propagates and keeps the reservation.
 */
export async function withAiUse<T extends { usage: AiTokenUsage }>(
  db: Db,
  userId: string,
  kind: AiKind,
  now: Date,
  call: () => Promise<T>,
): Promise<AiUseOutcome<T>> {
  const day = taipeiDate(now);
  if (!(await reserveAiUse(db, userId, kind, day))) return { kind: "limit" };
  let result: T;
  try {
    result = await call();
  } catch (err) {
    if (err instanceof AiUnavailable) {
      await releaseAiUse(db, userId, kind, day);
      return { kind: "unavailable" };
    }
    throw err;
  }
  await addAiTokens(db, userId, kind, day, result.usage);
  return { kind: "done", result };
}
