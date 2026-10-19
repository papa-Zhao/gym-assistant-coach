import { useState, type FormEvent } from "react";
import type { FinishSummary as FinishSummaryData, Template } from "@gac/shared";
import { apiFetch } from "../../api";
import { isAuthExpired } from "./fields";

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
      else setError("存成範本失敗，請再試一次。");
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
