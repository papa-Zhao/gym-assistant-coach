import { useEffect, useRef, useState } from "react";
import {
  METRIC_LIMITS,
  isValidMetric,
  roundMetric,
  trailingAverage,
  type BodyMetricsResponse,
  type MetricKey,
} from "@gac/shared";
import { ApiHttpError, AuthExpiredError, apiFetch } from "../api";
import { formatChange, seriesFor, shortDate } from "../bodyMetricsView";
import { TrendChart } from "../components/TrendChart";

const RANGES = [7, 30, 90] as const;
const KEYS: readonly MetricKey[] = ["weightKg", "bodyFatPct", "waistCm"];
const SIDE_KEYS: readonly MetricKey[] = ["bodyFatPct", "waistCm"];
const DEFAULT_DAYS = 30;
const EXAMPLES: Record<MetricKey, string> = {
  weightKg: "72.5",
  bodyFatPct: "18.6",
  waistCm: "81",
};

type FormValues = Record<MetricKey, string>;
const EMPTY_FORM: FormValues = { weightKg: "", bodyFatPct: "", waistCm: "" };

function fieldError(key: MetricKey, text: string): string | null {
  if (text.trim() === "") return null;
  if (isValidMetric(key, Number(text))) return null;
  const { min, max } = METRIC_LIMITS[key];
  return `請輸入 ${min}–${max} 之間的數字`;
}

interface BodyMetricsProps {
  /** Called when the session cannot be recovered or loading failed. */
  onFatal: () => void;
}

export function BodyMetrics({ onFatal }: BodyMetricsProps) {
  const [days, setDays] = useState<number>(DEFAULT_DAYS);
  const [metric, setMetric] = useState<MetricKey>("weightKg");
  const [data, setData] = useState<BodyMetricsResponse | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Set when a save already put the data for the next `days` value in place.
  const skipFetch = useRef(false);

  useEffect(() => {
    if (skipFetch.current) {
      skipFetch.current = false;
      return;
    }
    let live = true;
    apiFetch<BodyMetricsResponse>(`/body-metrics?days=${days}`)
      .then((res) => {
        if (live) setData(res);
      })
      .catch(() => {
        if (live) onFatal();
      });
    return () => {
      live = false;
    };
  }, [days, onFatal]);

  const errors = Object.fromEntries(
    KEYS.map((k) => [k, fieldError(k, form[k])]),
  ) as Record<MetricKey, string | null>;
  const filled = KEYS.filter((k) => form[k].trim() !== "");
  const canSave =
    !saving && filled.length > 0 && filled.every((k) => errors[k] === null);

  async function save() {
    const body: Partial<Record<MetricKey, number>> = {};
    for (const k of filled) body[k] = roundMetric(Number(form[k]));
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch<BodyMetricsResponse>("/body-metrics/today", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      // The response covers 30 days; show it instead of fetching again.
      if (days !== DEFAULT_DAYS) skipFetch.current = true;
      setDays(DEFAULT_DAYS);
      setData(res);
      setForm(EMPTY_FORM);
      setFormOpen(false);
    } catch (err) {
      if (err instanceof AuthExpiredError) onFatal();
      else if (err instanceof ApiHttpError && err.status === 400)
        setSaveError("數字格式有誤，請檢查上面的欄位。");
      else setSaveError("儲存失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  }

  if (!data)
    return (
      <main>
        <p>載入中…</p>
      </main>
    );

  const { label, unit } = METRIC_LIMITS[metric];
  const series = seriesFor(data.points, metric);
  const average = trailingAverage(series);
  const latest = series.at(-1);
  const first = series[0];
  const change = formatChange(series);

  return (
    <main>
      <p className="step">我的紀錄</p>
      <h1>身體數據</h1>
      <div className="seg" role="group" aria-label="時間範圍">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={days === r}
            onClick={() => setDays(r)}
          >
            {r} 天
          </button>
        ))}
      </div>

      {data.points.length === 0 ? (
        <section className="card">
          <p>還沒有紀錄。在聊天室輸入「體重 72.5」就能開始記錄。</p>
        </section>
      ) : (
        <>
          <section className="card stack">
            <h2>{label}</h2>
            <div>
              <span className="metric-value">
                {latest ? latest.value : "—"}
              </span>
              {latest && <span className="metric-unit">{unit}</span>}
            </div>
            {latest && first ? (
              <>
                <p className="change">
                  {days} 天內 {change}
                  {change !== "—" && ` ${unit}`}
                </p>
                <TrendChart
                  points={series}
                  average={average}
                  label={label}
                  unit={unit}
                  days={days}
                />
                <p className="muted chart-range">
                  <span>{shortDate(first.date)}</span>
                  <span>…</span>
                  <span>{shortDate(latest.date)}</span>
                </p>
                <p className="muted legend">
                  <span className="l-dot">每日紀錄</span>
                  <span className="l-line">7 日平均</span>
                </p>
              </>
            ) : (
              <p className="muted">
                這段期間還沒有{label}紀錄。可以在聊天室輸入「{label}{" "}
                {EXAMPLES[metric]}」或按下方「記錄今天的數據」。
              </p>
            )}
            {metric !== "weightKg" && (
              <button
                type="button"
                className="tile back"
                onClick={() => setMetric("weightKg")}
              >
                回到體重
              </button>
            )}
          </section>
          <div className="tiles">
            {SIDE_KEYS.map((k) => {
              const s = seriesFor(data.points, k);
              const v = s.at(-1);
              const meta = METRIC_LIMITS[k];
              return (
                <button
                  key={k}
                  type="button"
                  className="tile"
                  aria-pressed={metric === k}
                  onClick={() => setMetric(k)}
                >
                  <span className="muted">{meta.label}</span>
                  <strong>{v ? `${v.value} ${meta.unit}` : "—"}</strong>
                  <span className="change">{formatChange(s)}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <p className="muted">在聊天室輸入「體重 72.4」就能快速記錄。</p>

      {formOpen ? (
        <form
          className="card stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) void save();
          }}
        >
          {KEYS.map((k) => {
            const meta = METRIC_LIMITS[k];
            const error = errors[k];
            return (
              <div key={k}>
                <label className="field">
                  <span>
                    {meta.label}（{meta.unit}）
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form[k]}
                    aria-invalid={error ? true : undefined}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [k]: e.target.value }))
                    }
                  />
                </label>
                {error && <p className="error-text">{error}</p>}
              </div>
            );
          })}
          {saveError && (
            <p className="error-text" role="alert">
              {saveError}
            </p>
          )}
          <button type="submit" disabled={!canSave}>
            儲存
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setFormOpen(true)}>
          記錄今天的數據
        </button>
      )}
    </main>
  );
}
