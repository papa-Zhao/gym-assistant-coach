import { useEffect, useState } from "react";
import { METRIC_LIMITS, type BodyMetricsResponse } from "@gac/shared";
import { apiFetch } from "../api";
import { formatChange, seriesFor } from "../bodyMetricsView";

interface RecordsProps {
  /** Called when the session cannot be recovered or loading failed. */
  onFatal: () => void;
}

const SOON = ["飲食", "訓練"] as const;

export function Records({ onFatal }: RecordsProps) {
  const [data, setData] = useState<BodyMetricsResponse | null>(null);

  useEffect(() => {
    let live = true;
    apiFetch<BodyMetricsResponse>("/body-metrics?days=30")
      .then((res) => {
        if (live) setData(res);
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
  const { unit } = METRIC_LIMITS.weightKg;

  return (
    <main>
      <h1>我的紀錄</h1>
      <a className="card link" href="/records/body">
        <h2>身體數據</h2>
        {!data ? (
          <p className="muted">載入中…</p>
        ) : latest ? (
          <>
            <p>
              <span className="metric-value">{latest.value}</span>
              <span className="metric-unit">{unit}</span>
            </p>
            <p className="change">
              30 天內 {formatChange(weight)} {unit}
            </p>
          </>
        ) : (
          <p className="muted">還沒有紀錄</p>
        )}
        <span className="muted">看趨勢 ›</span>
      </a>
      {SOON.map((label) => (
        <button key={label} type="button" className="card soon" disabled>
          <span>{label}</span>
          <span className="badge">即將推出</span>
        </button>
      ))}
    </main>
  );
}
