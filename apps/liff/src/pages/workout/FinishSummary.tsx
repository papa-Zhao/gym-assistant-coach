import { useState, type FormEvent } from "react";
import type {
  FinishSummary as FinishSummaryData,
  Template,
  WorkoutAdviceResponse,
  WorkoutAiAdvice,
} from "@gac/shared";
import { apiFetch, failureMessage } from "../../api";
import { isAuthExpired } from "./fields";
import { formatRest } from "./RestTimer";
import { getRestSec } from "./restSettings";

/** Average rest this far over the saved target earns a tip. */
const REST_TIP_OVER_SEC = 60;

const ADVICE_FAILED = "這次沒辦法產生建議，請稍後再試";
const ADVICE_MESSAGES: Record<
  Exclude<WorkoutAdviceResponse["outcome"], "ok">,
  string
> = {
  limit: "今天問 AI 的次數用完了，明天再試",
  refused: ADVICE_FAILED,
  unavailable: "AI 暫時忙不過來，請稍後再試",
};

function restTip(avgRestSec: number | null): string | null {
  if (avgRestSec === null) return null;
  const target = getRestSec();
  if (avgRestSec - target < REST_TIP_OVER_SEC) return null;
  return `平均休息 ${formatRest(avgRestSec)}，比你設定的 ${formatRest(target)} 多，可以縮短一點讓訓練更緊湊`;
}

interface FinishSummaryProps {
  summary: FinishSummaryData;
  onClose: () => void;
  /** Called when the session cannot be recovered. */
  onFatal: () => void;
}

export function FinishSummary({
  summary,
  onClose,
  onFatal,
}: FinishSummaryProps) {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tips] = useState(() => {
    const rest = restTip(summary.avgRestSec);
    return rest ? [...summary.tips, rest] : summary.tips;
  });
  const [advice, setAdvice] = useState<WorkoutAiAdvice | null>(null);
  const [asking, setAsking] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);

  const askCoach = async () => {
    if (asking) return;
    setAsking(true);
    setAdviceError(null);
    try {
      const r = await apiFetch<WorkoutAdviceResponse>(
        `/workouts/${summary.sessionId}/advice`,
        { method: "POST" },
      );
      if (r.outcome === "ok") setAdvice(r.advice);
      else setAdviceError(ADVICE_MESSAGES[r.outcome]);
    } catch (err) {
      if (isAuthExpired(err)) onFatal();
      else setAdviceError(failureMessage(err, ADVICE_FAILED));
    } finally {
      setAsking(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("請輸入範本名稱");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch<Template>("/templates", {
        method: "POST",
        body: JSON.stringify({
          fromSessionId: summary.sessionId,
          name: trimmed,
        }),
      });
      setSaved(true);
    } catch (err) {
      if (isAuthExpired(err)) onFatal();
      else setError(failureMessage(err, "存成範本失敗，請再試一次。"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <h1>訓練完成</h1>
      <section className="card stack">
        <p>
          <span className="metric-value">{Math.round(summary.volumeKg)}</span>
          <span className="metric-unit">kg 總訓練量</span>
        </p>
        <p>
          {summary.exerciseCount} 個動作・{summary.setCount} 組
          {summary.cardioMinutes > 0 && `・有氧 ${summary.cardioMinutes} 分鐘`}
        </p>
        {summary.avgRestSec !== null && (
          <p>平均休息 {formatRest(summary.avgRestSec)}</p>
        )}
        {summary.notified && <p className="muted">已傳到聊天室</p>}
      </section>
      {summary.prs.length > 0 && (
        <section className="card explain" aria-label="個人最佳">
          <h2>個人最佳紀錄</h2>
          {summary.prs.map((pr) => (
            <p key={pr.exerciseId}>
              {pr.nameZh}
              {pr.nameEn && <small> {pr.nameEn}</small>}：{pr.weightKg} kg ×{" "}
              {pr.reps}（估算 1RM {pr.e1rm} kg）
            </p>
          ))}
        </section>
      )}
      {tips.length > 0 && (
        <section className="card stack tips" aria-label="訓練建議">
          <h2>訓練建議</h2>
          <ul>
            {tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          {advice ? (
            <div className="stack" role="status">
              <h3>{advice.title}</h3>
              <ul>
                {advice.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : (
            summary.aiAdviceAvailable && (
              <>
                {adviceError && (
                  <p className="error-text" role="alert">
                    {adviceError}
                  </p>
                )}
                <button
                  type="button"
                  className="secondary"
                  disabled={asking}
                  onClick={() => void askCoach()}
                >
                  問 AI 教練（會用掉 1 次問 AI 的次數）
                </button>
              </>
            )
          )}
        </section>
      )}
      <section className="card">
        {saved ? (
          <p role="status">已存成範本</p>
        ) : (
          <form className="stack" onSubmit={(e) => void save(e)}>
            <label className="field">
              範本名稱
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="secondary" disabled={busy}>
              存成範本
            </button>
          </form>
        )}
      </section>
      <button type="button" onClick={onClose}>
        回到聊天室
      </button>
    </main>
  );
}
