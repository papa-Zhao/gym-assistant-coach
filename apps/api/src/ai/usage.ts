import { AI_DAILY_LIMITS, type AiKind } from "@gac/shared";
import { and, eq, sql } from "drizzle-orm";
import { aiUsageDaily } from "../db/schema";
import type { Db } from "../users/repo";

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
