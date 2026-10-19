import type { BodyMetricPoint, MetricKey } from "@gac/shared";

export interface SeriesPoint {
  date: string;
  value: number;
}

/** The dated values of one metric, skipping days without it. */
export function seriesFor(
  points: BodyMetricPoint[],
  key: MetricKey,
): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (const p of points) {
    const value = p[key];
    if (value !== null) out.push({ date: p.date, value });
  }
  return out;
}

/** Last minus first, one decimal with a sign ("+0.4", "−1.2"); "—" under two points. */
export function formatChange(series: SeriesPoint[]): string {
  const first = series[0];
  const last = series.at(-1);
  if (!first || !last || series.length < 2) return "—";
  const diff = Math.round((last.value - first.value) * 10) / 10;
  if (diff === 0) return "0.0";
  return `${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)}`;
}

/** `YYYY-MM-DD` to `M/D`, without going through `Date`. */
export function shortDate(date: string): string {
  const [, m = "0", d = "0"] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}
