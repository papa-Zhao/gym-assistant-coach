import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  EQUIPMENT,
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_LABELS,
  EXERCISE_KINDS,
  EXERCISE_KIND_LABELS,
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  equipmentCategory,
  type Equipment,
  type Exercise,
  type ExerciseKind,
  type ExerciseSuggestion,
  type MuscleGroup,
} from "@gac/shared";
import { apiFetch } from "../../api";
import { isAuthExpired } from "./fields";
import { Skeleton } from "../../components/Skeleton";
import { EquipmentPhoto, type PhotoPhase } from "./EquipmentPhoto";
import { ExerciseRow } from "./ExerciseRow";

interface ExercisePickerProps {
  onPick: (exercise: Exercise) => void;
  onClose: () => void;
  /** Called when the session cannot be recovered. */
  onFatal: () => void;
  /** An add is in flight: rows and submit are disabled. */
  busy?: boolean;
  /** Message from a failed add. */
  error?: string | null;
}

const SEARCH_DEBOUNCE_MS = 250;

export function ExercisePicker({
  onPick,
  onClose,
  onFatal,
  busy = false,
  error = null,
}: ExercisePickerProps) {
  const [kind, setKind] = useState<ExerciseKind>("strength");
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Exercise[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [custom, setCustom] = useState(false);
  const [photo, setPhoto] = useState<PhotoPhase>({ kind: "idle" });
  const [initial, setInitial] = useState<ExerciseSuggestion | undefined>();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    let live = true;
    const params = new URLSearchParams({ kind });
    if (query) params.set("q", query);
    if (kind === "strength" && muscle) params.set("muscle", muscle);
    if (kind === "strength" && category) params.set("category", category);
    apiFetch<Exercise[]>(`/exercises?${params.toString()}`)
      .then((list) => {
        if (!live) return;
        setResults(list);
        setFailed(false);
      })
      .catch((err: unknown) => {
        if (!live) return;
        if (isAuthExpired(err)) onFatal();
        else setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [kind, muscle, category, query, onFatal]);

  const onType = (value: string) => {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => setQuery(value.trim()),
      SEARCH_DEBOUNCE_MS,
    );
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    clearTimeout(timer.current);
    setQuery(draft.trim());
  };

  if (custom) {
    return (
      <CustomExerciseForm
        onCreated={onPick}
        initial={initial}
        onBack={() => {
          setCustom(false);
          setInitial(undefined);
        }}
        onFatal={onFatal}
        busy={busy}
        error={error}
      />
    );
  }

  return (
    <main>
      <h1>加動作</h1>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <EquipmentPhoto
        phase={photo}
        onPhase={setPhoto}
        onPick={onPick}
        onCustom={(suggestion) => {
          setInitial(suggestion);
          setCustom(true);
        }}
        onFatal={onFatal}
        busy={busy}
      >
        <form className="stack" role="search" onSubmit={onSubmit}>
          <label className="field">
            搜尋動作
            <input
              type="search"
              value={draft}
              placeholder="中文或英文，例如 bench"
              onChange={(e) => onType(e.target.value)}
            />
          </label>
          <button type="submit" className="secondary">
            搜尋
          </button>
        </form>
        <div className="chips picker-chips" role="group" aria-label="種類">
          {EXERCISE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`chip${kind === k ? " selected" : ""}`}
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                setMuscle(null);
                setCategory(null);
              }}
            >
              {EXERCISE_KIND_LABELS[k]}
            </button>
          ))}
        </div>
        {kind === "strength" && (
          <>
            <div className="chips picker-chips" role="group" aria-label="肌群">
              {MUSCLE_GROUPS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`chip${muscle === m ? " selected" : ""}`}
                  aria-pressed={muscle === m}
                  onClick={() => setMuscle(muscle === m ? null : m)}
                >
                  {MUSCLE_GROUP_LABELS[m]}
                </button>
              ))}
            </div>
            <div
              className="chips picker-chips"
              role="group"
              aria-label="器材類別"
            >
              {EQUIPMENT_CATEGORIES.filter((c) => c !== "cardio_equipment").map(
                (c) => (
                  <button
                    key={c}
                    type="button"
                    className={`chip${category === c ? " selected" : ""}`}
                    aria-pressed={category === c}
                    onClick={() => setCategory(category === c ? null : c)}
                  >
                    {EQUIPMENT_CATEGORY_LABELS[c]}
                  </button>
                ),
              )}
            </div>
          </>
        )}
        <section className="card list picker-list" aria-label="動作列表">
          {failed ? (
            <p className="error-text">載入動作失敗，請再試一次。</p>
          ) : results === null ? (
            <Skeleton layout="rows" />
          ) : results.length === 0 ? (
            <p className="muted">找不到符合的動作</p>
          ) : (
            results.map((ex) => (
              <ExerciseRow
                key={ex.id}
                exercise={ex}
                disabled={busy}
                onPick={onPick}
              />
            ))
          )}
        </section>
        <div className="stack picker-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => setCustom(true)}
          >
            新增自訂動作
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            返回訓練
          </button>
        </div>
      </EquipmentPhoto>
    </main>
  );
}

interface CustomFormProps {
  initial?: ExerciseSuggestion | undefined;
  busy: boolean;
  error: string | null;
  onCreated: (exercise: Exercise) => void;
  onBack: () => void;
  onFatal: () => void;
}

function CustomExerciseForm({
  initial,
  onCreated,
  onBack,
  onFatal,
  busy: adding,
  error: addError,
}: CustomFormProps) {
  const [nameZh, setNameZh] = useState(initial?.nameZh ?? "");
  const [nameEn, setNameEn] = useState("");
  const [kind, setKind] = useState<ExerciseKind>(initial?.kind ?? "strength");
  const [muscle, setMuscle] = useState<MuscleGroup | "">(
    initial?.muscleGroup ?? "",
  );
  const [equipment, setEquipment] = useState<Equipment | "">(
    initial?.equipment ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const equipmentOptions = EQUIPMENT.filter(
    (e) =>
      (equipmentCategory(e) === "cardio_equipment") === (kind === "cardio"),
  );
  const valid =
    nameZh.trim() !== "" &&
    equipment !== "" &&
    (kind === "cardio" || muscle !== "");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await apiFetch<Exercise>("/exercises", {
        method: "POST",
        body: JSON.stringify({
          nameZh: nameZh.trim(),
          ...(nameEn.trim() ? { nameEn: nameEn.trim() } : {}),
          kind,
          ...(kind === "strength" && muscle ? { muscleGroup: muscle } : {}),
          equipment,
        }),
      });
      onCreated(created);
      setBusy(false);
    } catch (err) {
      if (isAuthExpired(err)) onFatal();
      else setError("無法新增，請檢查欄位後再試一次。");
      setBusy(false);
    }
  };

  return (
    <main>
      <h1>新增自訂動作</h1>
      <form className="card stack" onSubmit={(e) => void submit(e)}>
        <label className="field">
          中文名稱
          <input value={nameZh} onChange={(e) => setNameZh(e.target.value)} />
        </label>
        <label className="field">
          英文名稱（選填）
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </label>
        <div className="chips" role="group" aria-label="動作種類">
          {EXERCISE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`chip${kind === k ? " selected" : ""}`}
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                setEquipment("");
                setMuscle("");
              }}
            >
              {EXERCISE_KIND_LABELS[k]}
            </button>
          ))}
        </div>
        {kind === "strength" && (
          <label className="field">
            肌群
            <select
              value={muscle}
              onChange={(e) => setMuscle(e.target.value as MuscleGroup)}
            >
              <option value="">請選擇</option>
              {MUSCLE_GROUPS.map((m) => (
                <option key={m} value={m}>
                  {MUSCLE_GROUP_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          器材
          <select
            value={equipment}
            onChange={(e) => setEquipment(e.target.value as Equipment)}
          >
            <option value="">請選擇</option>
            {equipmentOptions.map((eq) => (
              <option key={eq} value={eq}>
                {EQUIPMENT_LABELS[eq]}
              </option>
            ))}
          </select>
        </label>
        {(error ?? addError) && (
          <p className="error-text" role="alert">
            {error ?? addError}
          </p>
        )}
        <button type="submit" disabled={!valid || busy || adding}>
          新增並加入訓練
        </button>
        <button type="button" className="secondary" onClick={onBack}>
          取消
        </button>
      </form>
    </main>
  );
}
