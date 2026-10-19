import { useEffect, useState, type FormEvent } from "react";
import {
  EQUIPMENT_CATEGORY_LABELS,
  type ActiveSession,
  type CardioEntry,
  type Exercise,
  type FinishSummary as FinishSummaryData,
  type SessionItem,
  type WorkoutSet,
} from "@gac/shared";
import { apiFetch } from "../../api";
import { shortDate } from "../../bodyMetricsView";
import { ExerciseName, ExercisePicker } from "./ExercisePicker";
import {
  SPEC,
  describeError,
  isAuthExpired,
  parseField,
  toText,
  type FieldName,
} from "./fields";

interface ActiveWorkoutProps {
  session: ActiveSession;
  onSession: (session: ActiveSession) => void;
  onFinished: (summary: FinishSummaryData) => void;
  /** Called after the in-progress workout was deleted. */
  onDiscarded: () => void;
  /** Called when the session cannot be recovered. */
  onFatal: () => void;
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
      {formatElapsed(now - Date.parse(startedAt))}
    </span>
  );
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
  const [picking, setPicking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (err: unknown, fallback: string) => {
    if (isAuthExpired(err)) onFatal();
    else setError(describeError(err, fallback));
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
    if (ok) setPicking(false);
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

  if (picking) {
    return (
      <ExercisePicker
        busy={busy}
        error={error}
        onPick={(ex) => void addExercise(ex)}
        onClose={() => setPicking(false)}
        onFatal={onFatal}
      />
    );
  }

  return (
    <main className="workout">
      <header className="workout-head">
        <h1>{session.templateName ?? "訓練進行中"}</h1>
        <Elapsed startedAt={session.startedAt} />
      </header>
      {discarding ? (
        <div className="confirm-row" role="group" aria-label="確認放棄訓練">
          <span>放棄後，這次的紀錄都會刪除。</span>
          <button type="button" disabled={busy} onClick={() => void discard()}>
            確定放棄
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setDiscarding(false)}
          >
            取消
          </button>
        </div>
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
        />
      ))}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="bottom-bar">
        {confirming ? (
          <div className="confirm-row" role="group" aria-label="確認結束訓練">
            <span>確定要結束這次訓練嗎？</span>
            <button type="button" disabled={busy} onClick={() => void finish()}>
              確定
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setConfirming(false)}
            >
              取消
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="secondary outline"
              onClick={() => setPicking(true)}
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
}

function ExerciseCard({ item, busy, mutate, send }: CardProps) {
  const { exercise, last, hint } = item;
  return (
    <section className="card exercise-card">
      <h2 className="exercise-name">
        <ExerciseName exercise={exercise} />
      </h2>
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
        <CardioSection item={item} busy={busy} mutate={mutate} send={send} />
      ) : (
        <StrengthSection item={item} busy={busy} mutate={mutate} send={send} />
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
}: CardProps & { item: SessionItem & { sets: WorkoutSet[] } }) {
  const [drafting, setDrafting] = useState(item.sets.length === 0);
  const [editing, setEditing] = useState<number | null>(null);
  const exerciseId = item.exercise.id;
  const newIndex = nextIndex(item.sets.map((s) => s.setIndex));

  const save = async (index: number, v: ParsedSet) =>
    mutate(() =>
      send("/sets", "PUT", {
        exerciseId,
        setIndex: index,
        weightKg: v.weightKg,
        reps: v.reps,
        ...(v.rpe === undefined ? {} : { rpe: v.rpe }),
      }),
    );

  return (
    <div className="set-grid" role="table" aria-label="組列表">
      <div className="set-row set-head" role="row">
        <span role="columnheader">組</span>
        <span role="columnheader">重量 kg</span>
        <span role="columnheader">次數</span>
        <span role="columnheader">RPE</span>
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
              if (await save(s.setIndex, v)) setEditing(null);
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
            if (await save(newIndex, v)) setDrafting(false);
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
      </div>
      <Err message={errors.weight} />
      <Err message={errors.reps} />
      <Err message={errors.rpe} />
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
