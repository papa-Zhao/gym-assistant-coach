import { useEffect, useState } from "react";
import {
  calcTargets,
  isBelowFloor,
  TARGET_LIMITS,
  validateProfile,
  type ActivityLevel,
  type Goal,
  type ProfileInput,
  type ProfileResponse,
  type Sex,
  type Targets,
} from "@gac/shared";
import { ApiHttpError, AuthExpiredError, apiFetch } from "../api";

const SEX_LABELS: Record<Sex, string> = { male: "男", female: "女" };
const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "久坐（幾乎不運動）",
  light: "輕度（每週 1–3 天）",
  moderate: "中等（每週 3–5 天）",
  active: "活躍（每週 6–7 天）",
  very_active: "非常活躍（體力工作或一天兩練）",
};
const GOAL_LABELS: Record<Goal, string> = {
  cut: "減脂",
  maintain: "維持",
  bulk: "增肌",
};

const FIELD_ERRORS: Record<string, string> = {
  sex: "請選擇生理性別。",
  birthYear: "出生年需讓年齡介於 18 到 100 歲之間。",
  heightCm: "身高需介於 100 到 250 公分。",
  weightKg: "體重需介於 30 到 300 公斤。",
  activityLevel: "請選擇活動量。",
};

interface Form {
  sex: Sex | "";
  birthYear: string;
  heightCm: string;
  weightKg: string;
  activityLevel: ActivityLevel | "";
  goal: Goal;
}

interface ManualForm {
  kcal: string;
  proteinG: string;
  carbG: string;
  fatG: string;
}

type Step = "loading" | 1 | 2 | "done";

const EMPTY_FORM: Form = {
  sex: "",
  birthYear: "",
  heightCm: "",
  weightKg: "",
  activityLevel: "",
  goal: "maintain",
};

function formFrom(input: ProfileInput): Form {
  return {
    sex: input.sex,
    birthYear: String(input.birthYear),
    heightCm: String(input.heightCm),
    weightKg: String(input.weightKg),
    activityLevel: input.activityLevel,
    goal: input.goal,
  };
}

/** Builds a `ProfileInput` from the form; unset or blank fields become invalid values. */
function inputFrom(form: Form): ProfileInput {
  return {
    sex: form.sex as Sex,
    birthYear: Number(form.birthYear),
    heightCm: Number(form.heightCm),
    weightKg: Number(form.weightKg),
    activityLevel: form.activityLevel as ActivityLevel,
    goal: form.goal,
  };
}

function manualFrom(t: Targets): ManualForm {
  return {
    kcal: String(t.kcal),
    proteinG: String(t.proteinG),
    carbG: String(t.carbG),
    fatG: String(t.fatG),
  };
}

const KCAL_ERROR = `請輸入 ${TARGET_LIMITS.kcal.min}–${TARGET_LIMITS.kcal.max} 的整數`;
const GRAM_ERROR = `請輸入 ${TARGET_LIMITS.gram.min}–${TARGET_LIMITS.gram.max} 的整數`;

type ManualErrors = Partial<Record<keyof ManualForm, string>>;

function inRange(text: string, min: number, max: number): number | null {
  const n = text.trim() === "" ? NaN : Number(text);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** Validates the manual form against the shared limits (same as the api). */
function parseManual(m: ManualForm): {
  targets: Targets | null;
  errors: ManualErrors;
} {
  const { kcal: k, gram: g } = TARGET_LIMITS;
  const kcal = inRange(m.kcal, k.min, k.max);
  const proteinG = inRange(m.proteinG, g.min, g.max);
  const carbG = inRange(m.carbG, g.min, g.max);
  const fatG = inRange(m.fatG, g.min, g.max);
  const errors: ManualErrors = {};
  if (kcal === null) errors.kcal = KCAL_ERROR;
  if (proteinG === null) errors.proteinG = GRAM_ERROR;
  if (carbG === null) errors.carbG = GRAM_ERROR;
  if (fatG === null) errors.fatG = GRAM_ERROR;
  const valid =
    kcal !== null && proteinG !== null && carbG !== null && fatG !== null;
  return {
    targets: valid ? { kcal, proteinG, carbG, fatG } : null,
    errors,
  };
}

interface ProfileProps {
  today: string;
  onClose: () => void;
  /** Called when the session cannot be recovered or loading failed. */
  onFatal: () => void;
}

export function Profile({ today, onClose, onFatal }: ProfileProps) {
  const [step, setStep] = useState<Step>("loading");
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [errors, setErrors] = useState<string[]>([]);
  const [hasProfile, setHasProfile] = useState(false);
  const [savedTargets, setSavedTargets] = useState<Targets | null>(null);
  // True while the saved manual targets are shown untouched (not yet recalculated).
  const [keepOverride, setKeepOverride] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState<ManualForm>({
    kcal: "",
    proteinG: "",
    carbG: "",
    fatG: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    apiFetch<ProfileResponse>("/profile")
      .then((res) => {
        if (!live) return;
        if (res.profile) {
          const { targetsOverridden, ...input } = res.profile;
          setForm(formFrom(input));
          setHasProfile(true);
          setKeepOverride(targetsOverridden && res.targets !== null);
          setSavedTargets(res.targets);
          setStep(2);
        } else {
          setStep(1);
        }
      })
      .catch(() => {
        if (live) onFatal();
      });
    return () => {
      live = false;
    };
  }, [onFatal]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function request<T>(
    path: string,
    body: unknown,
    badRequestMessage = "資料格式有誤，請回上一步檢查。",
  ): Promise<T | null> {
    setSaving(true);
    setSaveError(null);
    try {
      return await apiFetch<T>(path, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (err instanceof AuthExpiredError) onFatal();
      else if (err instanceof ApiHttpError && err.status === 400)
        setSaveError(badRequestMessage);
      else setSaveError("儲存失敗，請稍後再試。");
      return null;
    } finally {
      setSaving(false);
    }
  }

  function next() {
    const bad = validateProfile(inputFrom(form), today);
    setErrors(bad);
    if (bad.length === 0) setStep(2);
  }

  async function saveGoal() {
    const res = await request<ProfileResponse>("/profile", inputFrom(form));
    if (res) setStep("done");
  }

  async function saveManual() {
    const { targets } = parseManual(manual);
    if (!targets) return;
    if (!hasProfile) {
      const created = await request<ProfileResponse>(
        "/profile",
        inputFrom(form),
      );
      if (!created) return;
      setHasProfile(true);
    }
    const res = await request<ProfileResponse>(
      "/profile/targets",
      targets,
      "數字格式有誤，請檢查上面的欄位。",
    );
    if (res) setStep("done");
  }

  if (step === "loading")
    return (
      <main>
        <p>載入中…</p>
      </main>
    );

  if (step === "done")
    return (
      <main>
        <section className="card">
          <p>完成！回到聊天室按「今日總覽」看看。</p>
          <button type="button" onClick={onClose}>
            回到聊天室
          </button>
        </section>
      </main>
    );

  if (step === 1)
    return (
      <main>
        <p className="step">步驟 1／2</p>
        <h1>先認識你一下</h1>
        <form
          className="card stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
        >
          <fieldset>
            <legend>生理性別</legend>
            <div className="chips">
              {(Object.keys(SEX_LABELS) as Sex[]).map((sex) => (
                <Chip
                  key={sex}
                  name="sex"
                  label={SEX_LABELS[sex]}
                  checked={form.sex === sex}
                  onSelect={() => set("sex", sex)}
                />
              ))}
            </div>
          </fieldset>
          <TextField
            label="出生年"
            inputMode="numeric"
            value={form.birthYear}
            onChange={(v) => set("birthYear", v)}
          />
          <TextField
            label="身高（公分）"
            inputMode="decimal"
            value={form.heightCm}
            onChange={(v) => set("heightCm", v)}
          />
          <TextField
            label="體重（公斤）"
            inputMode="decimal"
            value={form.weightKg}
            onChange={(v) => set("weightKg", v)}
          />
          <fieldset>
            <legend>活動量</legend>
            <div className="chips column">
              {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => (
                <Chip
                  key={a}
                  name="activity"
                  label={ACTIVITY_LABELS[a]}
                  checked={form.activityLevel === a}
                  onSelect={() => set("activityLevel", a)}
                />
              ))}
            </div>
          </fieldset>
          <p className="muted">本服務限 18 歲以上使用。</p>
          {errors.length > 0 && (
            <ul className="errors" role="alert">
              {errors.map((field) => (
                <li key={field}>{FIELD_ERRORS[field] ?? "資料有誤。"}</li>
              ))}
            </ul>
          )}
          <button type="submit">下一步</button>
        </form>
      </main>
    );

  const input = inputFrom(form);
  const calc = calcTargets(input, today);
  const { targets: manualTargets, errors: manualErrors } = parseManual(manual);
  const shown = keepOverride && savedTargets ? savedTargets : calc.targets;
  const showWarning =
    manualOpen &&
    manualTargets !== null &&
    isBelowFloor(input, manualTargets.kcal, today);

  function toggleManual() {
    if (!manualOpen) setManual(manualFrom(shown));
    setManualOpen(!manualOpen);
  }

  return (
    <main>
      <p className="step">步驟 2／2</p>
      <h1>你的每日目標</h1>
      <section className="card stack">
        <fieldset>
          <legend>目標</legend>
          <div className="chips">
            {(Object.keys(GOAL_LABELS) as Goal[]).map((goal) => (
              <Chip
                key={goal}
                name="goal"
                label={GOAL_LABELS[goal]}
                checked={form.goal === goal}
                onSelect={() => {
                  set("goal", goal);
                  setKeepOverride(false);
                }}
              />
            ))}
          </div>
        </fieldset>
        <div className="kcal">
          <span className="kcal-num">{shown.kcal}</span>
          <span className="kcal-unit">kcal／天</span>
        </div>
        <div className="macros">
          <Macro label="蛋白質" grams={shown.proteinG} />
          <Macro label="碳水" grams={shown.carbG} />
          <Macro label="脂肪" grams={shown.fatG} />
        </div>
        <div className="explain">
          {keepOverride ? (
            <p>目前使用你手動設定的目標。</p>
          ) : (
            <>
              <p>依你的身高、體重、年齡與活動量計算（Mifflin-St Jeor 公式）</p>
              {calc.clampedToFloor && <p>已調整到安全下限</p>}
            </>
          )}
        </div>
        {saveError && (
          <p className="error-text" role="alert">
            {saveError}
          </p>
        )}
        {keepOverride ? (
          <>
            <button
              type="button"
              disabled={saving}
              onClick={() => setStep("done")}
            >
              保留目前目標
            </button>
            <button
              type="button"
              className="secondary"
              disabled={saving}
              onClick={() => void saveGoal()}
            >
              改回計算值（{calc.targets.kcal} kcal）
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveGoal()}
          >
            就用這個目標
          </button>
        )}
        <button
          type="button"
          className="secondary"
          aria-expanded={manualOpen}
          onClick={toggleManual}
        >
          手動調整數字
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setKeepOverride(false);
            setStep(1);
          }}
        >
          修改基本資料
        </button>
      </section>
      {manualOpen && (
        <section className="card stack">
          <TextField
            label="熱量（kcal）"
            inputMode="decimal"
            value={manual.kcal}
            error={manualErrors.kcal}
            onChange={(v) => setManual((m) => ({ ...m, kcal: v }))}
          />
          <TextField
            label="蛋白質（g）"
            inputMode="decimal"
            value={manual.proteinG}
            error={manualErrors.proteinG}
            onChange={(v) => setManual((m) => ({ ...m, proteinG: v }))}
          />
          <TextField
            label="碳水（g）"
            inputMode="decimal"
            value={manual.carbG}
            error={manualErrors.carbG}
            onChange={(v) => setManual((m) => ({ ...m, carbG: v }))}
          />
          <TextField
            label="脂肪（g）"
            inputMode="decimal"
            value={manual.fatG}
            error={manualErrors.fatG}
            onChange={(v) => setManual((m) => ({ ...m, fatG: v }))}
          />
          {showWarning && (
            <p className="error-text" role="status">
              低於建議的安全下限（{calc.floorKcal} kcal），請確認這是你想要的。
            </p>
          )}
          <button
            type="button"
            disabled={saving || manualTargets === null}
            onClick={() => void saveManual()}
          >
            儲存調整
          </button>
        </section>
      )}
    </main>
  );
}

function Chip(props: {
  name: string;
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label className={props.checked ? "chip selected" : "chip"}>
      <input
        type="radio"
        name={props.name}
        checked={props.checked}
        onChange={props.onSelect}
      />
      {props.label}
    </label>
  );
}

function TextField(props: {
  label: string;
  inputMode: "decimal" | "numeric";
  value: string;
  error?: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="field">
        <span>{props.label}</span>
        <input
          type="text"
          inputMode={props.inputMode}
          value={props.value}
          aria-invalid={props.error ? true : undefined}
          onChange={(e) => props.onChange(e.target.value)}
        />
      </label>
      {props.error && <p className="error-text">{props.error}</p>}
    </div>
  );
}

function Macro({ label, grams }: { label: string; grams: number }) {
  return (
    <div className="macro">
      <span className="muted">{label}</span>
      <strong>{grams} g</strong>
    </div>
  );
}
