interface Point {
  date: string;
  value: number;
}

interface TrendChartProps {
  points: Point[];
  average: Point[];
  label: string;
  unit: string;
  /** Window length, used only for the accessible name. */
  days?: number;
}

const W = 320;
const H = 160;
const PAD_X = 12;
const PAD_Y = 12;

const dayNumber = (date: string) =>
  Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/** Hand-written SVG: daily dots plus a trailing-average line. */
export function TrendChart({
  points,
  average,
  label,
  unit,
  days,
}: TrendChartProps) {
  const values = [...points, ...average].map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const margin = (hi - lo) * 0.1;
  const min = lo - margin;
  const span = hi - lo + margin * 2;

  const dates = points.map((p) => dayNumber(p.date));
  const x0 = Math.min(...dates);
  const xSpan = Math.max(...dates) - x0;

  const x = (date: string) =>
    xSpan === 0
      ? W / 2
      : PAD_X + ((dayNumber(date) - x0) / xSpan) * (W - PAD_X * 2);
  // A flat series (one point, or all equal) sits on the middle line.
  const y = (value: number) =>
    span === 0 ? H / 2 : H - PAD_Y - ((value - min) / span) * (H - PAD_Y * 2);

  const first = points[0];
  const last = points.at(-1);
  const name = `${days ? `${label} ${days} 天` : label}趨勢：從 ${first?.value} 到 ${last?.value} ${unit}`;
  const line = average.map((p) => `${x(p.date)},${y(p.value)}`).join(" ");

  return (
    <svg
      className="chart"
      role="img"
      aria-label={name}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
    >
      {average.length > 1 && (
        <polyline
          points={line}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {points.map((p, i) => (
        <circle
          key={p.date}
          cx={x(p.date)}
          cy={y(p.value)}
          r={i === points.length - 1 ? 5 : 3}
          fill={
            i === points.length - 1
              ? "var(--color-primary)"
              : "var(--color-border)"
          }
        />
      ))}
    </svg>
  );
}
