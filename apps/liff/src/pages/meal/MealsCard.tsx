import { useEffect, useState } from "react";
import {
  MEAL_TYPE_LABELS,
  type DayMeals,
  type Meal,
  type MealType,
  type ProfileResponse,
} from "@gac/shared";
import { apiFetch } from "../../api";
import { Skeleton } from "../../components/Skeleton";

interface MealsCardProps {
  /** Called when the session cannot be recovered or loading failed. */
  onFatal: (err?: unknown) => void;
}

const ROW_TYPES: readonly MealType[] = ["breakfast", "lunch", "dinner"];
const ORDER: readonly MealType[] = [...ROW_TYPES, "snack"];

/** Up to two item names joined with ＋, then 等 when there are more. */
export function mealSummary(meal: Meal): string {
  const names = meal.items.slice(0, 2).map((i) => i.name);
  return names.join("＋") + (meal.items.length > 2 ? "等" : "");
}

export function MealsCard({ onFatal }: MealsCardProps) {
  const [day, setDay] = useState<DayMeals | null>(null);
  const [target, setTarget] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    apiFetch<DayMeals>("/meals")
      .then((res) => {
        if (live) setDay(res);
      })
      .catch((err: unknown) => {
        if (live) onFatal(err);
      });
    // A missing target only hides the progress bar.
    apiFetch<ProfileResponse>("/profile")
      .then((res) => {
        if (live) setTarget(res.targets?.kcal ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [onFatal]);

  if (!day) {
    return (
      <section className="card" aria-label="飲食">
        <h2>飲食</h2>
        <Skeleton layout="value" />
      </section>
    );
  }

  const rows = ORDER.flatMap(
    (type): { type: MealType; meal: Meal | null }[] => {
      const logged = day.meals.filter((m) => m.mealType === type);
      if (logged.length > 0) return logged.map((meal) => ({ type, meal }));
      return ROW_TYPES.includes(type) ? [{ type, meal: null }] : [];
    },
  );
  const eaten = day.consumed.kcal;
  const pct =
    target && target > 0
      ? Math.min(100, Math.round((eaten / target) * 100))
      : 0;

  return (
    <section className="card" aria-label="飲食">
      <h2>飲食</h2>
      <p className="meal-kcal">
        <span className="metric-value">{eaten}</span>
        <span className="metric-unit">
          {target ? `／ ${target} kcal` : "kcal"}
        </span>
      </p>
      {target !== null && (
        <div
          className="bar-track"
          role="progressbar"
          aria-label="今日熱量"
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={Math.min(eaten, target)}
        >
          <span className="bar-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="list meal-list">
        {rows.map(({ type, meal }) =>
          meal ? (
            <a
              key={meal.id}
              className="row meal-row"
              href={`/meal?id=${meal.id}`}
            >
              <span className="meal-type">{MEAL_TYPE_LABELS[type]}</span>
              <span className="row-name">{mealSummary(meal)}</span>
              <span className="meal-row-kcal">
                {meal.total.kcal} kcal{meal.status === "draft" ? " 草稿" : ""} ›
              </span>
            </a>
          ) : (
            <a key={type} className="row meal-row" href={`/meal?type=${type}`}>
              <span className="meal-type">{MEAL_TYPE_LABELS[type]}</span>
              <span className="row-name muted">還沒記錄</span>
              <span className="meal-add">＋ 記錄</span>
            </a>
          ),
        )}
      </div>
    </section>
  );
}
