import { useEffect, useState } from "react";
import {
  METRIC_LIMITS,
  type BodyMetricsResponse,
  type WeekStats,
} from "@gac/shared";
import { apiFetch } from "../api";
import {
  formatChange,
  seriesFor,
  trendOf,
  type SeriesPoint,
} from "../bodyMetricsView";
import { Icon } from "../components/Icon";
import { Skeleton } from "../components/Skeleton";
import { MealsCard } from "./meal/MealsCard";

interface RecordsProps {
  /** Called when the session cannot be recovered or loading failed. */
  onFatal: (err?: unknown) => void;
}

export function Records({ onFatal }: RecordsProps) {
  const [data, setData] = useState<BodyMetricsResponse | null>(null);
  const [week, setWeek] = useState<WeekStats | null>(null);

  useEffect(() => {
    let live = true;
    apiFetch<BodyMetricsResponse>("/body-metrics?days=30")
      .then((res) => {
        if (live) setData(res);
      })
      .catch((err: unknown) => {
        if (live) onFatal(err);
      });
    apiFetch<WeekStats>("/workouts/week")
      .then((res) => {
        if (live) setWeek(res);
      })
      .catch((err: unknown) => {
        if (live) onFatal(err);
      });
    return () => {
      live = false;
    };
  }, [onFatal]);

  const weight = data ? seriesFor(data.points, "weightKg") : [];
  const latest = weight.at(-1);
  const change = formatChange(weight);
  const { unit } = METRIC_LIMITS.weightKg;

  const trend = trendOf(change);

  return (
    <main className="records">
      <h1>我的紀錄</h1>
      <MealsCard onFatal={onFatal} />
      <a className="card link" href="/records/body">
        <div className="card-head">
          <span className="card-icon">
            <Icon name="scale" />
          </span>
          <h2>身體數據</h2>
          <Icon name="chevronRight" className="card-chevron" />
        </div>
        {!data ? (
          <Skeleton layout="value" />
        ) : latest ? (
          <div className="weight-row">
            <div>
              <p className="weight-value">
                <span className="metric-value num">{latest.value}</span>
                <span className="metric-unit">{unit}</span>
              </p>
              <p className={trend ? `change ${trend}` : "change"}>
                {trend && (
                  <Icon
                    name={trend === "down" ? "trendDown" : "trendUp"}
                    size={16}
                  />
                )}
                {change === "—"
                  ? "目前只有一筆紀錄"
                  : `30 天內 ${change} ${unit}`}
              </p>
            </div>
            {weight.length >= 2 && <Sparkline points={weight} />}
          </div>
        ) : (
          <p className="muted">還沒有紀錄</p>
        )}
      </a>
      <section className="card">
        <div className="card-head">
          <span className="card-icon">
            <Icon name="dumbbell" />
          </span>
          <h2>訓練</h2>
        </div>
        {week ? (
          <div className="stat-pair">
            <p className="stat">
              <span className="sr-only">本週訓練 {week.sessions} 次</span>
              <span className="stat-label" aria-hidden="true">
                本週訓練
              </span>
              <span className="stat-value num" aria-hidden="true">
                {week.sessions}
                <small>次</small>
              </span>
            </p>
            <p className="stat">
              <span className="stat-label">本週有氧</span>
              <span className="stat-value num">
                {week.cardioMinutes}
                <small>分鐘</small>
              </span>
            </p>
          </div>
        ) : (
          <Skeleton layout="value" />
        )}
        <div className="card-links">
          <a className="pill-link primary" href="/workout">
            <Icon name="plus" size={18} />
            記訓練
          </a>
          <a className="pill-link" href="/records/workouts">
            看紀錄
            <Icon name="chevronRight" size={18} />
          </a>
        </div>
      </section>
    </main>
  );
}

/** Decorative 30-day weight line; the number above carries the meaning. */
function Sparkline({ points }: { points: SeriesPoint[] }) {
  const W = 120;
  const H = 44;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * (W - 4) + 2;
      const y = H - 4 - ((p.value - lo) / span) * (H - 8);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      className="sparkline"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}
