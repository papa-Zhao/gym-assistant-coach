import { and, asc, eq, lte, sql } from "drizzle-orm";
import { aiUsageAnonymousDaily, aiUsageDaily, users } from "../db/schema";
import { mealPhotoPrefix, type PhotoStore } from "../photos/store";
import type { Db } from "../users/repo";

/** With the job at 04:00 daily, an account is gone by day 7 after deletion. */
export const DELETION_GRACE_DAYS = 6;
/** Keeps one run well inside the Cloud Run request timeout; the rest wait a day. */
export const PURGE_BATCH = 100;

const DAY_MS = 86_400_000;

interface PurgeLog {
  warn(fields: object, msg: string): void;
}

const silent: PurgeLog = { warn: () => {} };

/** Hard-deletes accounts deleted at least DELETION_GRACE_DAYS ago (oldest first, at most PURGE_BATCH); returns how many were removed. */
export async function purgeDeletedUsers(
  db: Db,
  photoStore: PhotoStore,
  now: Date,
  log: PurgeLog = silent,
): Promise<number> {
  const cutoff = new Date(now.getTime() - DELETION_GRACE_DAYS * DAY_MS);
  const due = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.status, "deleted"), lte(users.deletedAt, cutoff)))
    .orderBy(asc(users.deletedAt))
    .limit(PURGE_BATCH);

  let removed = 0;
  for (const { id } of due) {
    // Photos first: if the bucket fails, the rows stay and tomorrow retries.
    try {
      await photoStore.deletePrefix(mealPhotoPrefix(id));
    } catch (err) {
      log.warn(
        { err: { name: err instanceof Error ? err.name : "unknown" } },
        "purge: photo delete failed; account kept for the next run",
      );
      continue;
    }
    await db.transaction(async (tx) => {
      await tx
        .insert(aiUsageAnonymousDaily)
        .select(
          tx
            .select({
              day: aiUsageDaily.day,
              kind: aiUsageDaily.kind,
              count: sql<number>`sum(${aiUsageDaily.count})::int`.as("count"),
              inputTokens:
                sql<number>`sum(${aiUsageDaily.inputTokens})::int`.as(
                  "input_tokens",
                ),
              outputTokens:
                sql<number>`sum(${aiUsageDaily.outputTokens})::int`.as(
                  "output_tokens",
                ),
              cacheReadTokens:
                sql<number>`sum(${aiUsageDaily.cacheReadTokens})::int`.as(
                  "cache_read_tokens",
                ),
              cacheCreationTokens:
                sql<number>`sum(${aiUsageDaily.cacheCreationTokens})::int`.as(
                  "cache_creation_tokens",
                ),
            })
            .from(aiUsageDaily)
            .where(eq(aiUsageDaily.userId, id))
            .groupBy(aiUsageDaily.day, aiUsageDaily.kind),
        )
        .onConflictDoUpdate({
          target: [aiUsageAnonymousDaily.day, aiUsageAnonymousDaily.kind],
          set: {
            count: sql`${aiUsageAnonymousDaily.count} + excluded.count`,
            inputTokens: sql`${aiUsageAnonymousDaily.inputTokens} + excluded.input_tokens`,
            outputTokens: sql`${aiUsageAnonymousDaily.outputTokens} + excluded.output_tokens`,
            cacheReadTokens: sql`${aiUsageAnonymousDaily.cacheReadTokens} + excluded.cache_read_tokens`,
            cacheCreationTokens: sql`${aiUsageAnonymousDaily.cacheCreationTokens} + excluded.cache_creation_tokens`,
          },
        });
      // Everything else the user owns goes with the row (on delete cascade).
      await tx.delete(users).where(eq(users.id, id));
    });
    removed += 1;
  }
  return removed;
}
