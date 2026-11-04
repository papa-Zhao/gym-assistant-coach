import { useEffect, useState } from "react";
import {
  MEAL_TYPE_LABELS,
  type DayMeals,
  type Meal,
  type MealType,
  type ProfileResponse,
  type Targets,
} from "@gac/shared";
import { apiFetch } from "../../api";
import { Icon } from "../../components/Icon";
import { Ring } from "../../components/Ring";
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
  const [targets, setTargets] = useState<Partial<Targets> | null>(null);

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
        if (live) setTargets(res.targets ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [onFatal]);

  const head = (
    <div className="card-head">
      <span className="card-icon">
        <Icon name="utensils" />
      </span>
      <h2>今日飲食</h2>
    </div>
  );

  if (!day) {
    return (
      <section className="card" aria-label="飲食">
        {head}
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
  const target = targets?.kcal && targets.kcal > 0 ? targets.kcal : null;
  const left = target === null ? null : target - eaten;
  const macros: { label: string; key: string; value: number; goal: number }[] =
    [];
  for (const [label, key, value, goal] of [
    ["蛋白質", "protein", day.consumed.proteinG, targets?.proteinG],
    ["碳水", "carb", day.consumed.carbG, targets?.carbG],
    ["脂肪", "fat", day.consumed.fatG, targets?.fatG],
  ] as const) {
    if (typeof goal === "number" && goal > 0)
      macros.push({ label, key, value, goal });
  }

  return (
    <section className="card" aria-label="飲食">
      {head}
      <div className="today-kcal">
        {target !== null ? (
          <div
            role="progressbar"
            aria-label="今日熱量"
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={Math.min(eaten, target)}
          >
            <Ring progress={eaten / target} size={128} stroke={11}>
              <span className="ring-value num">{eaten}</span>
              <span className="ring-unit">{`／ ${target} kcal`}</span>
            </Ring>
          </div>
        ) : (
          <p className="meal-kcal">
            <span className="metric-value num">{eaten}</span>
            <span className="metric-unit">kcal</span>
          </p>
        )}
        {target !== null && (
          <div className="today-side">
            <p className="kcal-left">
              {left !== null && left >= 0 ? (
                <>
                  還可以吃 <strong className="num">{left}</strong> kcal
                </>
              ) : (
                <>
                  超過 <strong className="num">{-(left ?? 0)}</strong> kcal
                </>
              )}
            </p>
            {macros.length > 0 && (
              <ul className="macro-bars">
                {macros.map(({ label, key, value, goal }) => (
                  <li key={key} className={`macro-bar ${key}`}>
                    <span className="macro-bar-label">{label}</span>
                    <span className="macro-bar-num num">
                      {Math.round(value)}
                      <span className="muted">／{goal} g</span>
                    </span>
                    <span className="bar-track" aria-hidden="true">
                      <span
                        className="bar-fill"
                        style={{
                          width: `${Math.min(100, Math.round((value / goal) * 100))}%`,
                        }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
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
                <span className="num">
                  {meal.total.kcal} kcal{meal.status === "draft" ? " 草稿" : ""}
                </span>
                <Icon name="chevronRight" size={16} />
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
