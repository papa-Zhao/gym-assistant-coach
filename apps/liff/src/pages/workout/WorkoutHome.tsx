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
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";

/** Muscle groups shown before "看全部". */
const TOP_MUSCLES = 3;

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
  const [showAll, setShowAll] = useState(false);
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

  const muscles = MUSCLE_GROUPS.filter((m) => week.setsByMuscle[m] > 0).sort(
    (a, b) => week.setsByMuscle[b] - week.setsByMuscle[a],
  );
  const maxSets = Math.max(1, ...muscles.map((m) => week.setsByMuscle[m]));
  const shown = showAll ? muscles : muscles.slice(0, TOP_MUSCLES);

  return (
    <main className="workout-home">
      <h1>記訓練</h1>
      <section className="card">
        <div className="card-head">
          <span className="card-icon">
            <Icon name="dumbbell" />
          </span>
          <h2>本週</h2>
        </div>
        <div className="stat-pair">
          <p className="stat">
            <span className="stat-label">訓練</span>
            <span className="stat-value num">
              {week.sessions}
              <small>次</small>
            </span>
          </p>
          <p className="stat">
            <span className="stat-label">有氧</span>
            <span className="stat-value num">
              {week.cardioMinutes}
              <small>分鐘</small>
            </span>
          </p>
        </div>
        {muscles.length > 0 && (
          <div className="muscle-bars">
            {shown.map((m) => (
              <div className="bar-row" key={m}>
                <span>{MUSCLE_GROUP_LABELS[m]}</span>
                <span className="bar-track" aria-hidden="true">
                  <span
                    className="bar-fill"
                    style={{
                      width: `${(week.setsByMuscle[m] / maxSets) * 100}%`,
                    }}
                  />
                </span>
                <span className="muted num">{week.setsByMuscle[m]} 組</span>
              </div>
            ))}
            {muscles.length > TOP_MUSCLES && (
              <button
                type="button"
                className="text-button more-button"
                aria-expanded={showAll}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? "收合" : `看全部 ${muscles.length} 個部位`}
              </button>
            )}
          </div>
        )}
        <div className="card-links">
          <a className="pill-link" href="/records/workouts">
            看訓練紀錄
            <Icon name="chevronRight" size={18} />
          </a>
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <span className="card-icon">
            <Icon name="layers" />
          </span>
          <h2>我的範本</h2>
        </div>
        {templates.length === 0 ? (
          <p className="muted">
            還沒有範本。訓練結束時可以把這次的動作存成範本。
          </p>
        ) : (
          <div className="list template-list">
            {templates.map((t) =>
              confirmId === t.id ? (
                <div className="template-row confirming" key={t.id}>
                  <ConfirmRow
                    label="確認刪除範本"
                    message={`確定刪除「${t.name}」？`}
                    confirmLabel="確定"
                    busy={busy}
                    onConfirm={() => void remove(t.id)}
                    onCancel={() => setConfirmId(null)}
                  />
                </div>
              ) : (
                <div className="template-row" key={t.id}>
                  <button
                    type="button"
                    className="row template-start"
                    aria-label={`開始 ${t.name}`}
                    disabled={busy}
                    onClick={() => void start(t.id)}
                  >
                    <span className="row-name">
                      <strong>{t.name}</strong>
                      <span className="muted">{t.items.length} 個動作</span>
                    </span>
                    <span className="template-go">
                      開始
                      <Icon name="chevronRight" size={16} />
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`刪除 ${t.name}`}
                    disabled={busy}
                    onClick={() => setConfirmId(t.id)}
                  >
                    <Icon name="trash" size={20} />
                  </button>
                </div>
              ),
            )}
          </div>
        )}
      </section>
      <div className="bottom-bar">
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
          <Icon name="plus" size={20} />
          開始訓練
        </button>
      </div>
    </main>
  );
}
