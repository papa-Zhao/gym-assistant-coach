import { useEffect, useState } from "react";
import type {
  CardioEntry,
  WorkoutHistoryEntry,
  WorkoutHistoryPage,
  WorkoutSet,
} from "@gac/shared";
import { apiFetch } from "../api";
import { Icon } from "../components/Icon";
import { Skeleton } from "../components/Skeleton";
import { formatRest } from "./workout/RestTimer";
import { isAuthExpired } from "./workout/fields";

interface WorkoutHistoryProps {
  /** Called when the session cannot be recovered or loading failed. */
  onFatal: (err?: unknown) => void;
}

/** `2026-10-05` -> `10/5` (no leading zeros). */
function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function setLine(set: WorkoutSet): string {
  let line = `第 ${set.setIndex} 組\u3000${set.weightKg} kg × ${set.reps}`;
  if (set.rpe !== undefined) line += `（RPE ${set.rpe}）`;
  if (set.restSec !== undefined) line += `・休息 ${formatRest(set.restSec)}`;
  return line;
}

function cardioLine(c: CardioEntry): string {
  return [
    `${c.durationMin} 分鐘`,
    c.distanceKm !== undefined && `${c.distanceKm} km`,
    c.inclinePct !== undefined && `坡度 ${c.inclinePct}%`,
    c.speedKmh !== undefined && `${c.speedKmh} km/h`,
    c.level !== undefined && `等級 ${c.level}`,
  ]
    .filter(Boolean)
    .join("・");
}

function EntryCard({ entry }: { entry: WorkoutHistoryEntry }) {
  let sets = 0;
  let volume = 0;
  let cardioMin = 0;
  for (const item of entry.items) {
    if ("sets" in item) {
      sets += item.sets.length;
      for (const s of item.sets) volume += s.weightKg * s.reps;
    } else {
      for (const c of item.cardio) cardioMin += c.durationMin;
    }
  }
  const stats = [
    `${entry.items.length} 個動作`,
    sets > 0 && `${sets} 組`,
    volume > 0 && `${Math.round(volume).toLocaleString("en-US")} kg`,
    cardioMin > 0 && `有氧 ${cardioMin} 分`,
  ].filter(Boolean);
  return (
    <section className="card history-card">
      <div className="card-head">
        <span className="card-icon">
          <Icon name="dumbbell" />
        </span>
        <h2>
          {shortDate(entry.date)}・{entry.templateName ?? "訓練"}
        </h2>
      </div>
      <p className="history-stats muted num">{stats.join(" · ")}</p>
      {entry.items.map((item) => (
        <div className="history-item" key={item.exercise.id}>
          <h3>{item.exercise.nameZh}</h3>
          <div className="history-sets num">
            {"sets" in item
              ? item.sets.map((s) => <p key={s.setIndex}>{setLine(s)}</p>)
              : item.cardio.map((c) => (
                  <p key={c.entryIndex}>{cardioLine(c)}</p>
                ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export function WorkoutHistory({ onFatal }: WorkoutHistoryProps) {
  const [entries, setEntries] = useState<WorkoutHistoryEntry[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);

  useEffect(() => {
    let live = true;
    apiFetch<WorkoutHistoryPage>("/workouts/history")
      .then((res) => {
        if (!live) return;
        setEntries(res.entries);
        setNextBefore(res.nextBefore);
      })
      .catch((err: unknown) => {
        if (live) onFatal(err);
      });
    return () => {
      live = false;
    };
  }, [onFatal]);

  const loadMore = async () => {
    if (nextBefore === null) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const res = await apiFetch<WorkoutHistoryPage>(
        `/workouts/history?before=${encodeURIComponent(nextBefore)}`,
      );
      setEntries((prev) => [...(prev ?? []), ...res.entries]);
      setNextBefore(res.nextBefore);
    } catch (err) {
      if (isAuthExpired(err)) onFatal(err);
      else setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <main className="history">
      <h1>訓練紀錄</h1>
      {entries === null ? (
        <Skeleton layout="rows" />
      ) : entries.length === 0 ? (
        <p className="muted">還沒有完成的訓練</p>
      ) : (
        entries.map((e) => <EntryCard key={e.id} entry={e} />)
      )}
      {moreError && (
        <p className="error-text" role="alert">
          載入失敗，請再試一次。
        </p>
      )}
      {nextBefore !== null && (
        <button
          type="button"
          className="secondary"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          載入更多
        </button>
      )}
    </main>
  );
}
