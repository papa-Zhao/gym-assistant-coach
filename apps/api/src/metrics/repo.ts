import { roundMetric, type BodyMetricPoint, type MetricKey } from "@gac/shared";
import { and, asc, desc, eq, gte, isNotNull, lt, lte } from "drizzle-orm";
import { bodyMetrics } from "../db/schema";
import type { Db } from "../users/repo";

const COLUMN = {
  weightKg: bodyMetrics.weightKg,
  bodyFatPct: bodyMetrics.bodyFatPct,
  waistCm: bodyMetrics.waistCm,
} as const;

/** Upserts one column of the day's row; the other columns are left alone. */
export async function recordMetric(
  db: Db,
  userId: string,
  date: string,
  key: MetricKey,
  value: number,
): Promise<void> {
  const stored = String(roundMetric(value));
  await db
    .insert(bodyMetrics)
    .values({ userId, measuredOn: date, [key]: stored })
    .onConflictDoUpdate({
      target: [bodyMetrics.userId, bodyMetrics.measuredOn],
      set: { [key]: stored },
    });
}

/** Latest value for `key` strictly before `beforeDate`, skipping null columns. */
export async function previousMetric(
  db: Db,
  userId: string,
  key: MetricKey,
  beforeDate: string,
): Promise<{ value: number; date: string } | null> {
  const column = COLUMN[key];
  const [row] = await db
    .select({ value: column, date: bodyMetrics.measuredOn })
    .from(bodyMetrics)
    .where(
      and(
        eq(bodyMetrics.userId, userId),
        lt(bodyMetrics.measuredOn, beforeDate),
        isNotNull(column),
      ),
    )
    .orderBy(desc(bodyMetrics.measuredOn))
    .limit(1);
  return row?.value == null
    ? null
    : { value: Number(row.value), date: row.date };
}

/** Rows from `from` to `to` inclusive, ascending by date. */
export async function listMetrics(
  db: Db,
  userId: string,
  from: string,
  to: string,
): Promise<BodyMetricPoint[]> {
  const rows = await db
    .select({
      date: bodyMetrics.measuredOn,
      weightKg: bodyMetrics.weightKg,
      bodyFatPct: bodyMetrics.bodyFatPct,
      waistCm: bodyMetrics.waistCm,
    })
    .from(bodyMetrics)
    .where(
      and(
        eq(bodyMetrics.userId, userId),
        gte(bodyMetrics.measuredOn, from),
        lte(bodyMetrics.measuredOn, to),
      ),
    )
    .orderBy(asc(bodyMetrics.measuredOn));
  const num = (v: string | null) => (v === null ? null : Number(v));
  return rows.map((r) => ({
    date: r.date,
    weightKg: num(r.weightKg),
    bodyFatPct: num(r.bodyFatPct),
    waistCm: num(r.waistCm),
  }));
}

/** Writes several columns of one day's row in a single transaction. */
export async function recordMetrics(
  db: Db,
  userId: string,
  date: string,
  entries: [MetricKey, number][],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [key, value] of entries) {
      await recordMetric(tx, userId, date, key, value);
    }
  });
}
