// Body metric limits, rounding and trailing average. Pure functions, no I/O.

export type MetricKey = "weightKg" | "bodyFatPct" | "waistCm";

export const METRIC_LIMITS: Record<
  MetricKey,
  { min: number; max: number; label: string; unit: string }
> = {
  weightKg: { min: 30, max: 300, label: "體重", unit: "kg" },
  bodyFatPct: { min: 3, max: 60, label: "體脂", unit: "%" },
  waistCm: { min: 40, max: 200, label: "腰圍", unit: "cm" },
};

const DAY_MS = 86_400_000;

/** Round half away from zero to one decimal (matches numeric(5,1)). */
export function roundMetric(v: number): number {
  return Math.round(v * 10 + Number.EPSILON * Math.sign(v)) / 10;
}

/** `v` must be finite and, once rounded to one decimal, within the limits. */
export function isValidMetric(key: MetricKey, v: number): boolean {
  if (typeof v !== "number" || !Number.isFinite(v)) return false;
  const { min, max } = METRIC_LIMITS[key];
  const r = roundMetric(v);
  return r >= min && r <= max;
}

/** Add `n` calendar days to a `YYYY-MM-DD` date, computed in UTC. */
export function addDays(date: string, n: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * For each point, the mean of all points dated within [d - (windowDays - 1), d].
 * Input must be sorted by ascending date.
 */
export function trailingAverage(
  points: { date: string; value: number }[],
  windowDays = 7,
): { date: string; value: number }[] {
  return points.map((p, i) => {
    const start = addDays(p.date, -(windowDays - 1));
    let sum = 0;
    let count = 0;
    for (let j = 0; j <= i; j++) {
      const q = points[j];
      if (q && q.date >= start) {
        sum += q.value;
        count++;
      }
    }
    return { date: p.date, value: roundMetric(sum / count) };
  });
}

export interface BodyMetricPoint {
  date: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  waistCm: number | null;
}

/** Only dates that have data, ascending. */
export interface BodyMetricsResponse {
  from: string;
  to: string;
  points: BodyMetricPoint[];
}

export interface MetricRecordedResponse {
  key: MetricKey;
  value: number;
  date: string;
  previous: { value: number; date: string } | null;
}
