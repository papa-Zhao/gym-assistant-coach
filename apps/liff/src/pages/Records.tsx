import { useEffect, useState } from "react";
import {
  METRIC_LIMITS,
  type BodyMetricsResponse,
  type WeekStats,
} from "@gac/shared";
import { apiFetch } from "../api";
import { formatChange, seriesFor } from "../bodyMetricsView";
import { Skeleton } from "../components/Skeleton";
import { MealsCard } from "./meal/MealsCard";

interface RecordsProps {
  /** Called when the session cannot be recovered or loading failed. */
  onFatal: () => void;
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
      .catch(() => {
        if (live) onFatal();
      });
    apiFetch<WeekStats>("/workouts/week")
      .then((res) => {
        if (live) setWeek(res);
      })
      .catch(() => {
        if (live) onFatal();
      });
    return () => {
      live = false;
    };
  }, [onFatal]);

  const weight = data ? seriesFor(data.points, "weightKg") : [];
  const latest = weight.at(-1);
  const change = formatChange(weight);
  const { unit } = METRIC_LIMITS.weightKg;

  return (
    <main>
      <h1>我的紀錄</h1>
      <a className="card link" href="/records/body">
        <h2>身體數據</h2>
        {!data ? (
          <Skeleton layout="value" />
        ) : latest ? (
          <>
            <p>
              <span className="metric-value">{latest.value}</span>
              <span className="metric-unit">{unit}</span>
            </p>
            <p className="change">
              {change === "—"
                ? "目前只有一筆紀錄"
                : `30 天內 ${change} ${unit}`}
            </p>
          </>
        ) : (
          <p className="muted">還沒有紀錄</p>
        )}
        <span className="muted">看趨勢 ›</span>
      </a>
      <a className="card link" href="/workout">
        <h2>訓練</h2>
        {week ? (
          <p>本週訓練 {week.sessions} 次</p>
        ) : (
          <Skeleton layout="value" />
        )}
        <span className="muted">記訓練 ›</span>
      </a>
      <MealsCard onFatal={onFatal} />
    </main>
  );
}
