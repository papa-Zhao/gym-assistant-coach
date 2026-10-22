import { useEffect, useState } from "react";
import {
  GRAMS_LIMITS,
  MAX_MEAL_ITEMS,
  MEAL_TYPES,
  MEAL_TYPE_LABELS,
  defaultMealType,
  isValidGrams,
  nutritionFor,
  scaleNutrition,
  sumNutrition,
  type Food,
  type Meal,
  type MealType,
  type Nutrition,
} from "@gac/shared";
import { ApiHttpError, apiFetch } from "../../api";
import { Skeleton } from "../../components/Skeleton";
import { ConfirmRow } from "../workout/ConfirmRow";
import { isAuthExpired } from "../workout/fields";
import { FoodSearch } from "./FoodSearch";

interface MealEditProps {
  /** Existing meal to edit; otherwise a new meal for `today`. */
  id?: string | null;
  /** Meal type for a new meal; defaults from the Taipei hour. */
  type?: string | null;
  /** Taipei calendar date (`YYYY-MM-DD`). */
  today: string;
  onFatal: () => void;
  /** After a save or delete; defaults to going back to the records page. */
  onDone?: () => void;
}

interface Line {
  key: string;
  /** Saved item id (edit mode); absent for newly added foods. */
  id?: string;
  foodId?: string | undefined;
  name: string;
  grams: string;
  /** How to preview nutrition for any grams. */
  calc: (grams: number) => Nutrition;
}

const STEP_G = 10;
const GRAMS_ERROR = `克數要在 ${GRAMS_LIMITS.min}–${GRAMS_LIMITS.max} 之間`;
const NOT_FOUND = "找不到這一餐";

function taipeiHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Taipei",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
}

function dateLabel(date: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${date}T00:00:00+08:00`));
}

function isMealType(v: string | null | undefined): v is MealType {
  return MEAL_TYPES.some((t) => t === v);
}

let nextKey = 0;
const newKey = () => `line-${(nextKey += 1)}`;

function linesFrom(meal: Meal): Line[] {
  return meal.items.map((item) => ({
    key: newKey(),
    id: item.id,
    foodId: item.foodId ?? undefined,
    name: item.name,
    grams: String(item.grams),
    calc: (g) => scaleNutrition(item, item.grams, g),
  }));
}

function lineFromFood(food: Food): Line {
  return {
    key: newKey(),
    foodId: food.id,
    name: food.name,
    grams: "100",
    calc: (g) => nutritionFor(food.per100g, g),
  };
}

function gramsOf(line: Line): number | null {
  const n = Number(line.grams);
  return line.grams.trim() !== "" && isValidGrams(n) ? n : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

type Load = "loading" | "ready" | "missing" | "failed";

export function MealEdit({
  id = null,
  type = null,
  today,
  onFatal,
  onDone = () => window.location.assign("/records"),
}: MealEditProps) {
  const editing = id !== null && id !== "";
  const [load, setLoad] = useState<Load>(editing ? "loading" : "ready");
  const [date, setDate] = useState(today);
  const [mealType, setMealType] = useState<MealType>(() =>
    isMealType(type) ? type : defaultMealType(taipeiHour(new Date())),
  );
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!editing) return;
    let live = true;
    apiFetch<Meal>(`/meals/${encodeURIComponent(id)}`)
      .then((meal) => {
        if (!live) return;
        setDate(meal.eatenOn);
        setMealType(meal.mealType);
        setLines(linesFrom(meal));
        setLoad("ready");
      })
      .catch((err: unknown) => {
        if (!live) return;
        if (isAuthExpired(err)) onFatal();
        else if (err instanceof ApiHttpError && err.status === 404)
          setLoad("missing");
        else setLoad("failed");
      });
    return () => {
      live = false;
    };
  }, [editing, id, onFatal]);

  if (load === "loading") {
    return (
      <main>
        <h1>修改這一餐</h1>
        <Skeleton layout="rows" />
      </main>
    );
  }
  if (load === "missing" || load === "failed") {
    return (
      <main>
        <section className="card stack">
          <p>{load === "missing" ? NOT_FOUND : "載入失敗，請稍後再試。"}</p>
          <a href="/records">回到我的紀錄</a>
        </section>
      </main>
    );
  }

  const patch = (key: string, grams: string) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, grams } : l)));
  const bump = (line: Line, dir: 1 | -1) => {
    const cur = gramsOf(line);
    if (cur === null) return;
    const next = Math.min(
      GRAMS_LIMITS.max,
      Math.max(GRAMS_LIMITS.min, round1(cur + dir * STEP_G)),
    );
    patch(line.key, String(next));
  };
  const add = (food: Food) => {
    if (lines.length >= MAX_MEAL_ITEMS) {
      setError(`一餐最多 ${MAX_MEAL_ITEMS} 個品項`);
      return;
    }
    setError(null);
    setLines((ls) => [...ls, lineFromFood(food)]);
  };

  const grams = lines.map(gramsOf);
  const allValid = lines.length > 0 && grams.every((g) => g !== null);
  const total = sumNutrition(
    lines.flatMap((l, i) => {
      const g = grams[i];
      return g === null || g === undefined ? [] : [l.calc(g)];
    }),
  );

  const fail = (err: unknown, fallback: string) => {
    if (isAuthExpired(err)) onFatal();
    else if (err instanceof ApiHttpError && err.status === 404)
      setLoad("missing");
    else setError(fallback);
  };

  const save = async () => {
    if (!allValid || busy) return;
    setBusy(true);
    setError(null);
    const items = lines.map((l, i) => {
      const g = grams[i] as number;
      return l.id ? { id: l.id, grams: g } : { foodId: l.foodId, grams: g };
    });
    try {
      if (editing) {
        await apiFetch<Meal>(`/meals/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify({ mealType, items }),
        });
      } else {
        await apiFetch<Meal>("/meals", {
          method: "POST",
          body: JSON.stringify({ eatenOn: date, mealType, items }),
        });
      }
      onDone();
    } catch (err) {
      fail(err, "儲存失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch<void>(`/meals/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      onDone();
    } catch (err) {
      setConfirmDelete(false);
      fail(err, "刪除失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="meal-page">
      <p className="step">{dateLabel(date)}</p>
      <h1>{editing ? "修改這一餐" : "記錄一餐"}</h1>
      <div className="chips" role="group" aria-label="餐別">
        {MEAL_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={`chip${mealType === t ? " selected" : ""}`}
            aria-pressed={mealType === t}
            onClick={() => setMealType(t)}
          >
            {MEAL_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="stack meal-items">
        {lines.length === 0 && (
          <p className="muted">還沒有品項，先搜尋食物。</p>
        )}
        {lines.map((line, i) => {
          const g = grams[i];
          const n = g === null || g === undefined ? null : line.calc(g);
          return (
            <section key={line.key} className="card meal-item">
              <div className="meal-item-head">
                <strong className="row-name">{line.name}</strong>
                <span className="muted">
                  {n ? `${n.kcal} kcal · 蛋白質 ${n.proteinG} g` : "—"}
                </span>
              </div>
              <div className="meal-item-controls">
                <button
                  type="button"
                  className="secondary step-btn"
                  aria-label={`${line.name} 減少 ${STEP_G} 克`}
                  disabled={g === null}
                  onClick={() => bump(line, -1)}
                >
                  −
                </button>
                <input
                  className="grams-input"
                  type="text"
                  inputMode="decimal"
                  aria-label={`${line.name} 克數`}
                  aria-invalid={g === null}
                  value={line.grams}
                  onChange={(e) => patch(line.key, e.target.value)}
                />
                <button
                  type="button"
                  className="secondary step-btn"
                  aria-label={`${line.name} 增加 ${STEP_G} 克`}
                  disabled={g === null}
                  onClick={() => bump(line, 1)}
                >
                  ＋
                </button>
                <button
                  type="button"
                  className="text-button"
                  aria-label={`刪除 ${line.name}`}
                  onClick={() =>
                    setLines((ls) => ls.filter((l) => l.key !== line.key))
                  }
                >
                  刪除
                </button>
              </div>
              {g === null && (
                <p className="error-text field-error" role="alert">
                  {GRAMS_ERROR}
                </p>
              )}
            </section>
          );
        })}
      </div>
      <FoodSearch onPick={add} onFatal={onFatal} />
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="bottom-bar meal-bar">
        <p className="meal-total">
          合計 <strong>{total.kcal}</strong> kcal
        </p>
        {confirmDelete ? (
          <ConfirmRow
            label="刪除這一餐"
            message="確定要刪除這一餐嗎？"
            confirmLabel="確定刪除"
            busy={busy}
            onConfirm={() => void remove()}
            onCancel={() => setConfirmDelete(false)}
          />
        ) : (
          <>
            <button
              type="button"
              disabled={!allValid || busy}
              onClick={() => void save()}
            >
              儲存並確認
            </button>
            {editing && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                刪除這一餐
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
