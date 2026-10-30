import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  EQUIPMENT_CATEGORY_LABELS,
  type ActiveSession,
  type CardioEntry,
  type Exercise,
  type FinishSummary as FinishSummaryData,
  type SessionItem,
  type WorkoutSet,
} from "@gac/shared";
import { apiFetch, failureMessage } from "../../api";
import { shortDate } from "../../bodyMetricsView";
import { ConfirmRow } from "./ConfirmRow";
import { ExerciseName } from "./ExerciseName";
import { ExercisePicker } from "./ExercisePicker";
import { ExerciseIllustration } from "../../illustrations/ExerciseIllustration";
import {
  SPEC,
  describeError,
  isAuthExpired,
  parseField,
  toText,
  type FieldName,
} from "./fields";
import { RestTimer, formatRest } from "./RestTimer";
import { unlockRestSound } from "./restAlert";
import { useWakeLock } from "./wakeLock";

interface ActiveWorkoutProps {
  session: ActiveSession;
  onSession: (session: ActiveSession) => void;
  onFinished: (summary: FinishSummaryData) => void;
  /** Called after the in-progress workout was deleted. */
  onDiscarded: () => void;
  /** Called when the session cannot be recovered. */
  onFatal: () => void;
}

/** Fixed to the viewport top; a spacer of the same height keeps content clear. */
function PinnedBar({ children }: { children: ReactNode }) {
  const barRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    setHeight(bar.offsetHeight);
    // ResizeObserver is missing in some environments (e.g. jsdom).
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(bar.offsetHeight));
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div className="rest-pinned" ref={barRef}>
        {children}
      </div>
      <div className="rest-spacer" style={{ height }} aria-hidden="true" />
    </>
  );
}

type Mutate = (call: () => Promise<ActiveSession>) => Promise<boolean>;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function Elapsed({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="elapsed">
      {`訓練 ${formatElapsed(now - Date.parse(startedAt))}`}
    </span>
  );
}

const MAX_REST_SEC = 3600;

/** Latest completedAt (epoch ms) across all strength sets, or null. */
function latestCompletedAt(session: ActiveSession): number | null {
  let latest: number | null = null;
  for (const item of session.items) {
    if (isCardio(item)) continue;
    for (const s of item.sets) {
      const t = Date.parse(s.completedAt);
      if (!Number.isNaN(t) && (latest === null || t > latest)) latest = t;
    }
  }
  return latest;
}

function isCardio(
  item: SessionItem,
): item is Extract<SessionItem, { cardio: CardioEntry[] }> {
  return "cardio" in item;
}

export function ActiveWorkout({
  session,
  onSession,
  onFinished,
  onDiscarded,
  onFatal,
}: ActiveWorkoutProps) {
  // Held on both the workout and picker views; hooks stay above any early return.
  useWakeLock(true);
  const [picking, setPicking] = useState(false);
  const [skippedFor, setSkippedFor] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Non-fatal message that must survive the picker closing.
  const [notice, setNotice] = useState<string | null>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const scrollTarget = useRef<string | null>(null);

  // After the picker closes and the new card renders, bring it into view.
  useEffect(() => {
    if (picking || scrollTarget.current === null) return;
    const el = cards.current.get(scrollTarget.current);
    if (!el) return;
    scrollTarget.current = null;
    if (typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [picking, session]);

  const fail = (err: unknown, fallback: string) => {
    if (isAuthExpired(err)) onFatal();
    else setError(describeError(err, failureMessage(err, fallback)));
  };

  // Every change goes to the server and the screen re-renders from its answer.
  const mutate: Mutate = async (call) => {
    setBusy(true);
    setError(null);
    try {
      onSession(await call());
      return true;
    } catch (err) {
      fail(err, "儲存失敗，請再試一次。");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const base = `/workouts/${session.id}`;
  const send = (path: string, method: string, body?: unknown) =>
    apiFetch<ActiveSession>(`${base}${path}`, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const addExercise = async (exercise: Exercise) => {
    const ok = await mutate(() =>
      send("/items", "POST", { exerciseId: exercise.id }),
    );
    if (ok) {
      scrollTarget.current = exercise.id;
      setPicking(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      onFinished(
        await apiFetch<FinishSummaryData>(`${base}/finish`, { method: "POST" }),
      );
    } catch (err) {
      setConfirming(false);
      fail(err, "結束訓練失敗，請再試一次。");
      setBusy(false);
    }
  };

  const discard = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch<undefined>(base, { method: "DELETE" });
      onDiscarded();
    } catch (err) {
      setDiscarding(false);
      fail(err, "放棄訓練失敗，請再試一次。");
      setBusy(false);
    }
  };

  const lastCompletedAt = latestCompletedAt(session);

  const restTimer = lastCompletedAt !== null && (
    <RestTimer
      lastCompletedAt={lastCompletedAt}
      skippedFor={skippedFor}
      onSkip={setSkippedFor}
    />
  );

  // The picker keeps the rest timer pinned above it.
  if (picking) {
    return (
      <>
        {restTimer && <PinnedBar>{restTimer}</PinnedBar>}
        <ExercisePicker
          busy={busy}
          error={error}
          onPick={(ex) => void addExercise(ex)}
          onNotice={setNotice}
          onClose={() => setPicking(false)}
          onFatal={onFatal}
        />
      </>
    );
  }

  return (
    <main className="workout">
      {restTimer && <PinnedBar>{restTimer}</PinnedBar>}
      <header className="workout-head">
        <h1>{session.templateName ?? "訓練進行中"}</h1>
        <Elapsed startedAt={session.startedAt} />
      </header>
      {discarding ? (
        <ConfirmRow
          label="確認放棄訓練"
          message="放棄後，這次的紀錄都會刪除。"
          confirmLabel="確定放棄"
          busy={busy}
          onConfirm={() => void discard()}
          onCancel={() => setDiscarding(false)}
        />
      ) : (
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => setDiscarding(true)}
        >
          放棄這次訓練
        </button>
      )}
      {session.items.length === 0 && (
        <p className="muted">還沒有動作，按下方「＋ 加動作」開始。</p>
      )}
      {session.items.map((item) => (
        <ExerciseCard
          key={item.exercise.id}
          item={item}
          busy={busy}
          mutate={mutate}
          send={send}
          lastCompletedAt={lastCompletedAt}
          register={(el) => {
            if (el) cards.current.set(item.exercise.id, el);
            else cards.current.delete(item.exercise.id);
          }}
        />
      ))}
      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="bottom-bar">
        {confirming ? (
          <ConfirmRow
            label="確認結束訓練"
            message="確定要結束這次訓練嗎？"
            confirmLabel="確定"
            busy={busy}
            onConfirm={() => void finish()}
            onCancel={() => setConfirming(false)}
          />
        ) : (
          <>
            <button
              type="button"
              className="secondary outline"
              onClick={() => {
                setNotice(null);
                setPicking(true);
              }}
            >
              ＋ 加動作
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setConfirming(true)}
            >
              結束訓練
            </button>
          </>
        )}
      </div>
    </main>
  );
}

interface CardProps {
  item: SessionItem;
  busy: boolean;
  mutate: Mutate;
  send: (
    path: string,
    method: string,
    body?: unknown,
  ) => Promise<ActiveSession>;
  /** Latest completedAt (epoch ms) across the session, for restSec. */
  lastCompletedAt: number | null;
}

function ExerciseCard({
  item,
  busy,
  mutate,
  send,
  lastCompletedAt,
  register,
}: CardProps & { register: (el: HTMLElement | null) => void }) {
  const { exercise, last, hint } = item;
  const [removing, setRemoving] = useState(false);
  return (
    <section className="card exercise-card" ref={register}>
      <div className="exercise-head">
        <ExerciseIllustration exercise={exercise} size={64} />
        <h2 className="exercise-name">
          <ExerciseName exercise={exercise} />
        </h2>
        {!removing && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            aria-label={`移除 ${exercise.nameZh}`}
            onClick={() => setRemoving(true)}
          >
            移除
          </button>
        )}
      </div>
      {removing && (
        <ConfirmRow
          label="確認移除動作"
          message="移除這個動作和本次的紀錄？"
          confirmLabel="確定移除"
          busy={busy}
          onConfirm={() =>
            void mutate(() => send(`/items/${exercise.id}`, "DELETE")).then(
              (ok) => {
                if (!ok) setRemoving(false);
              },
            )
          }
          onCancel={() => setRemoving(false)}
        />
      )}
      <span className="badge">
        {EQUIPMENT_CATEGORY_LABELS[exercise.equipmentCategory]}
      </span>
      {last && last.sets.length > 0 && (
        <p className="muted">
          上次（{shortDate(last.date)}）：
          {last.sets[0] && `${last.sets[0].weightKg} kg × `}
          {last.sets.map((s) => s.reps).join("、")}
        </p>
      )}
      {hint && (
        <p className="explain">
          上次每組都做到了，今天試試 {hint.suggestWeightKg} kg？
        </p>
      )}
      {isCardio(item) ? (
        <CardioSection
          item={item}
          busy={busy}
          mutate={mutate}
          send={send}
          lastCompletedAt={lastCompletedAt}
        />
      ) : (
        <StrengthSection
          item={item}
          busy={busy}
          mutate={mutate}
          send={send}
          lastCompletedAt={lastCompletedAt}
        />
      )}
    </section>
  );
}

function nextIndex(indices: number[]): number {
  return indices.length === 0 ? 1 : Math.max(...indices) + 1;
}

function Err({ message }: { message?: string | undefined }) {
  return message ? (
    <span className="error-text field-error" role="alert">
      {message}
    </span>
  ) : null;
}

interface SetValues {
  weight: string;
  reps: string;
  rpe: string;
}

function prefill(item: SessionItem & { sets: WorkoutSet[] }): SetValues {
  const done = item.sets.at(-1);
  if (done) {
    return { weight: toText(done.weightKg), reps: toText(done.reps), rpe: "" };
  }
  const first = item.last?.sets[0];
  return {
    weight: toText(item.hint?.suggestWeightKg ?? first?.weightKg),
    reps: toText(item.targetReps ?? first?.reps),
    rpe: "",
  };
}

function StrengthSection({
  item,
  busy,
  mutate,
  send,
  lastCompletedAt,
}: CardProps & { item: SessionItem & { sets: WorkoutSet[] } }) {
  const [drafting, setDrafting] = useState(item.sets.length === 0);
  const [editing, setEditing] = useState<number | null>(null);
  const exerciseId = item.exercise.id;
  const newIndex = nextIndex(item.sets.map((s) => s.setIndex));

  // Rest is only recorded for a new set that follows an earlier one.
  const save = async (index: number, v: ParsedSet, isNew: boolean) =>
    mutate(() => {
      const restSec =
        isNew && lastCompletedAt !== null
          ? Math.min(
              MAX_REST_SEC,
              Math.max(0, Math.round((Date.now() - lastCompletedAt) / 1000)),
            )
          : undefined;
      return send("/sets", "PUT", {
        exerciseId,
        setIndex: index,
        weightKg: v.weightKg,
        reps: v.reps,
        ...(v.rpe === undefined ? {} : { rpe: v.rpe }),
        ...(restSec === undefined ? {} : { restSec }),
      });
    });

  return (
    <div className="set-grid" role="table" aria-label="組列表">
      <div className="set-row set-head" role="row">
        <span role="columnheader">組</span>
        <span role="columnheader">重量 kg</span>
        <span role="columnheader">次數</span>
        <span role="columnheader">RPE</span>
        <span role="columnheader">休息</span>
        <span role="columnheader">
          <span className="sr-only">操作</span>
        </span>
      </div>
      {item.sets.map((s) =>
        editing === s.setIndex ? (
          <SetEditor
            key={`edit-${s.setIndex}`}
            label={`${s.setIndex}`}
            initial={{
              weight: toText(s.weightKg),
              reps: toText(s.reps),
              rpe: toText(s.rpe),
            }}
            busy={busy}
            submitLabel="儲存"
            onSubmit={async (v) => {
              if (await save(s.setIndex, v, false)) setEditing(null);
            }}
            onCancel={() => setEditing(null)}
            onDelete={async () => {
              if (
                await mutate(() =>
                  send(`/sets/${exerciseId}/${s.setIndex}`, "DELETE"),
                )
              )
                setEditing(null);
            }}
          />
        ) : (
          <div className="set-row done" role="row" key={s.setIndex}>
            <span role="cell" className="done-mark">
              {s.setIndex} ✓
            </span>
            <span role="cell">{s.weightKg}</span>
            <span role="cell">{s.reps}</span>
            <span role="cell">{s.rpe ?? "—"}</span>
            <span role="cell">
              {s.restSec === undefined ? "—" : formatRest(s.restSec)}
            </span>
            <button
              type="button"
              className="secondary mini"
              aria-label={`修改第 ${s.setIndex} 組`}
              onClick={() => setEditing(s.setIndex)}
            >
              修改
            </button>
          </div>
        ),
      )}
      {drafting ? (
        <SetEditor
          key={`new-${newIndex}`}
          label={`${newIndex}`}
          initial={prefill(item)}
          busy={busy}
          submitLabel="完成這組"
          onSubmit={async (v) => {
            // Inside the tap gesture, so the browser lets the beep play later.
            unlockRestSound();
            if (await save(newIndex, v, true)) setDrafting(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => setDrafting(true)}
        >
          ＋ 加一組
        </button>
      )}
    </div>
  );
}

interface ParsedSet {
  weightKg: number;
  reps: number;
  rpe: number | undefined;
}

interface SetEditorProps {
  label: string;
  initial: SetValues;
  busy: boolean;
  submitLabel: string;
  onSubmit: (v: ParsedSet) => Promise<void>;
  onCancel?: () => void;
  onDelete?: () => Promise<void>;
}

function SetEditor({
  label,
  initial,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
}: SetEditorProps) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<
    Partial<Record<keyof SetValues, string>>
  >({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const weight = parseField(v.weight, SPEC.weightKg, true);
    const reps = parseField(v.reps, SPEC.reps, true);
    const rpe = parseField(v.rpe, SPEC.rpe, false);
    const next: typeof errors = {};
    if (!weight.ok) next.weight = weight.message;
    if (!reps.ok) next.reps = reps.message;
    if (!rpe.ok) next.rpe = rpe.message;
    setErrors(next);
    if (!weight.ok || !reps.ok || !rpe.ok) return;
    await onSubmit({
      weightKg: weight.value as number,
      reps: reps.value as number,
      rpe: rpe.value,
    });
  };

  const input = (
    key: keyof SetValues,
    name: string,
    extra: { primary?: boolean; step: string },
  ) => (
    <div className="set-cell">
      <input
        aria-label={`第 ${label} 組${name}`}
        inputMode="decimal"
        step={extra.step}
        className={extra.primary ? "primary-border" : undefined}
        aria-invalid={errors[key] ? true : undefined}
        value={v[key]}
        onChange={(e) => setV({ ...v, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <form className="set-editor" onSubmit={(e) => void submit(e)}>
      <div className="set-row active">
        <span className="set-no">{label}</span>
        {input("weight", "重量", { primary: true, step: "0.1" })}
        {input("reps", "次數", { step: "1" })}
        {input("rpe", "RPE", { step: "0.5" })}
        <span />
        <span />
      </div>
      <Err message={errors.weight} />
      <Err message={errors.reps} />
      <Err message={errors.rpe} />
      <p className="muted set-hint">1 很輕鬆 – 10 力竭</p>
      <div className="editor-actions">
        <button type="submit" disabled={busy}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            取消
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void onDelete()}
          >
            刪除這組
          </button>
        )}
      </div>
    </form>
  );
}

const CARDIO_FIELDS: {
  key: FieldName;
  label: string;
  required: boolean;
}[] = [
  { key: "durationMin", label: "時間（分鐘）", required: true },
  { key: "distanceKm", label: "距離（km，選填）", required: false },
  { key: "inclinePct", label: "坡度（%，選填）", required: false },
  { key: "speedKmh", label: "速度（km/h，選填）", required: false },
  { key: "level", label: "等級（選填）", required: false },
];

function CardioSection({
  item,
  busy,
  mutate,
  send,
}: CardProps & { item: SessionItem & { cardio: CardioEntry[] } }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const nextEntry = nextIndex(item.cardio.map((c) => c.entryIndex));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, number> = {};
    const next: Record<string, string> = {};
    for (const f of CARDIO_FIELDS) {
      const parsed = parseField(values[f.key] ?? "", SPEC[f.key], f.required);
      if (!parsed.ok) next[f.key] = parsed.message;
      else if (parsed.value !== undefined) body[f.key] = parsed.value;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const ok = await mutate(() =>
      send("/cardio", "PUT", {
        exerciseId: item.exercise.id,
        entryIndex: nextEntry,
        ...body,
      }),
    );
    if (ok) setValues({});
  };

  return (
    <div className="cardio">
      {item.cardio.map((c) => (
        <div className="set-row done cardio-row" key={c.entryIndex}>
          <span className="done-mark">{c.entryIndex} ✓</span>
          <span>
            {[
              `${c.durationMin} 分鐘`,
              c.distanceKm !== undefined && `${c.distanceKm} km`,
              c.inclinePct !== undefined && `坡度 ${c.inclinePct}%`,
              c.speedKmh !== undefined && `${c.speedKmh} km/h`,
              c.level !== undefined && `等級 ${c.level}`,
            ]
              .filter(Boolean)
              .join("・")}
          </span>
          <button
            type="button"
            className="secondary mini"
            disabled={busy}
            aria-label={`刪除第 ${c.entryIndex} 筆`}
            onClick={() =>
              void mutate(() =>
                send(`/cardio/${item.exercise.id}/${c.entryIndex}`, "DELETE"),
              )
            }
          >
            刪除
          </button>
        </div>
      ))}
      <form className="stack" onSubmit={(e) => void submit(e)}>
        {CARDIO_FIELDS.map((f) => (
          <label className="field" key={f.key}>
            {f.label}
            <input
              inputMode="decimal"
              value={values[f.key] ?? ""}
              aria-invalid={errors[f.key] ? true : undefined}
              onChange={(e) =>
                setValues({ ...values, [f.key]: e.target.value })
              }
            />
            <Err message={errors[f.key]} />
          </label>
        ))}
        <button type="submit" disabled={busy}>
          完成這筆
        </button>
      </form>
    </div>
  );
}
