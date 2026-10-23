import { useCallback, useEffect, useState } from "react";
import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  type ActiveSession,
  type FinishSummary as FinishSummaryData,
  type Template,
  type WeekStats,
} from "@gac/shared";
import { apiFetch, failureMessage } from "../../api";
import { ActiveWorkout } from "./ActiveWorkout";
import { ConfirmRow } from "./ConfirmRow";
import { FinishSummary } from "./FinishSummary";
import { isAuthExpired } from "./fields";
import { Skeleton } from "../../components/Skeleton";

interface WorkoutHomeProps {
  /** Called when the session cannot be recovered or loading failed. */
  onFatal: (err?: unknown) => void;
  /** Closes the LIFF window (back to the chat room). */
  onClose: () => void;
}

interface HomeData {
  week: WeekStats;
  templates: Template[];
}

type Phase =
  | { kind: "loading" }
  | { kind: "home"; data: HomeData }
  | { kind: "active"; session: ActiveSession }
  | { kind: "finished"; summary: FinishSummaryData };

export function WorkoutHome({ onFatal, onClose }: WorkoutHomeProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  const loadHome = useCallback(async (): Promise<Phase> => {
    const active = await apiFetch<ActiveSession | null>("/workouts/active");
    if (active) return { kind: "active", session: active };
    const [week, templates] = await Promise.all([
      apiFetch<WeekStats>("/workouts/week"),
      apiFetch<Template[]>("/templates"),
    ]);
    return { kind: "home", data: { week, templates } };
  }, []);

  const reload = useCallback(() => {
    setPhase({ kind: "loading" });
    loadHome()
      .then(setPhase)
      .catch((err: unknown) => onFatal(err));
  }, [loadHome, onFatal]);

  useEffect(() => {
    let live = true;
    loadHome()
      .then((next) => {
        if (live) setPhase(next);
      })
      .catch((err: unknown) => {
        if (live) onFatal(err);
      });
    return () => {
      live = false;
    };
  }, [loadHome, onFatal]);

  switch (phase.kind) {
    case "loading":
      return (
        <main>
          <Skeleton layout="workout" />
        </main>
      );
    case "active":
      return (
        <ActiveWorkout
          session={phase.session}
          onSession={(session) => setPhase({ kind: "active", session })}
          onFinished={(summary) => setPhase({ kind: "finished", summary })}
          onDiscarded={reload}
          onFatal={onFatal}
        />
      );
    case "finished":
      return (
        <FinishSummary
          summary={phase.summary}
          onClose={onClose}
          onFatal={onFatal}
        />
      );
    case "home":
      return (
        <Home
          data={phase.data}
          onData={(data) => setPhase({ kind: "home", data })}
          onStarted={(session) => setPhase({ kind: "active", session })}
          onFatal={onFatal}
        />
      );
  }
}

interface HomeProps {
  data: HomeData;
  onData: (data: HomeData) => void;
  onStarted: (session: ActiveSession) => void;
  onFatal: () => void;
}

function Home({ data, onData, onStarted, onFatal }: HomeProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { week, templates } = data;

  const guard = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      if (isAuthExpired(err)) onFatal();
      else setError(failureMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const start = (templateId?: string) =>
    guard(async () => {
      onStarted(
        await apiFetch<ActiveSession>("/workouts", {
          method: "POST",
          body: JSON.stringify(templateId ? { templateId } : {}),
        }),
      );
    }, "無法開始訓練，請再試一次。");

  const remove = (id: string) =>
    guard(async () => {
      await apiFetch<null>(`/templates/${id}`, { method: "DELETE" });
      setConfirmId(null);
      onData({ ...data, templates: templates.filter((t) => t.id !== id) });
    }, "刪除失敗，請再試一次。");

  const muscles = MUSCLE_GROUPS.filter((m) => week.setsByMuscle[m] > 0);
  const maxSets = Math.max(1, ...muscles.map((m) => week.setsByMuscle[m]));

  return (
    <main>
      <h1>記訓練</h1>
      <section className="card stack">
        <h2>本週訓練 {week.sessions} 次</h2>
        {muscles.length === 0 && week.cardioMinutes === 0 && (
          <p className="muted">本週還沒有紀錄</p>
        )}
        {muscles.map((m) => (
          <div className="bar-row" key={m}>
            <span>{MUSCLE_GROUP_LABELS[m]}</span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{ width: `${(week.setsByMuscle[m] / maxSets) * 100}%` }}
              />
            </span>
            <span className="muted">{week.setsByMuscle[m]} 組</span>
          </div>
        ))}
        {week.cardioMinutes > 0 && <p>有氧 {week.cardioMinutes} 分鐘</p>}
      </section>
      <section className="card stack">
        <h2>我的範本</h2>
        {templates.length === 0 && <p className="muted">還沒有範本</p>}
        {templates.map((t) => (
          <div className="template-row" key={t.id}>
            <strong>{t.name}</strong>
            {confirmId === t.id ? (
              <ConfirmRow
                label="確認刪除範本"
                message={`確定刪除「${t.name}」？`}
                confirmLabel="確定"
                busy={busy}
                onConfirm={() => void remove(t.id)}
                onCancel={() => setConfirmId(null)}
              />
            ) : (
              <div className="editor-actions">
                <button
                  type="button"
                  aria-label={`開始 ${t.name}`}
                  disabled={busy}
                  onClick={() => void start(t.id)}
                >
                  開始
                </button>
                <button
                  type="button"
                  className="secondary"
                  aria-label={`刪除 ${t.name}`}
                  onClick={() => setConfirmId(t.id)}
                >
                  刪除
                </button>
              </div>
            )}
          </div>
        ))}
      </section>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="start-button"
        disabled={busy}
        onClick={() => void start()}
      >
        開始訓練
      </button>
    </main>
  );
}
