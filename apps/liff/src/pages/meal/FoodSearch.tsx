import { useEffect, useRef, useState } from "react";
import type { Food } from "@gac/shared";
import { apiFetch, failureMessage } from "../../api";
import { isAuthExpired } from "../workout/fields";
import { Skeleton } from "../../components/Skeleton";

interface FoodSearchProps {
  onPick: (food: Food) => void;
  /** Called when the session cannot be recovered. */
  onFatal: () => void;
}

const DEBOUNCE_MS = 300;
const MAX_QUERY = 40;

export const FOOD_SOURCE_LINE =
  "資料來源：衛生福利部食品藥物管理署 食品營養成分資料庫";

export function FoodSearch({ onPick, onFatal }: FoodSearchProps) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  // Outcome of the latest finished lookup, tagged with the query it answers.
  const [outcome, setOutcome] = useState<{
    query: string;
    foods: Food[] | null;
    /** Set when the lookup failed. */
    error?: string;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (query === "") return;
    let live = true;
    apiFetch<{ foods: Food[] }>(`/foods?q=${encodeURIComponent(query)}`)
      .then((res) => {
        if (live) setOutcome({ query, foods: res.foods });
      })
      .catch((err: unknown) => {
        if (!live) return;
        if (isAuthExpired(err)) onFatal();
        else
          setOutcome({
            query,
            foods: null,
            error: failureMessage(err, "搜尋失敗，請再試一次。"),
          });
      });
    return () => {
      live = false;
    };
  }, [query, onFatal]);

  const answered = outcome?.query === query ? outcome : null;
  const failed = answered !== null && answered.foods === null;
  const results = answered?.foods ?? null;

  const onType = (value: string) => {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setQuery(value.trim()), DEBOUNCE_MS);
  };

  return (
    <section className="stack" aria-label="食物搜尋">
      <label className="field">
        新增或換成其他食物
        <input
          type="search"
          value={draft}
          maxLength={MAX_QUERY}
          placeholder="例如 白飯、雞胸肉"
          onChange={(e) => onType(e.target.value)}
        />
      </label>
      {query !== "" && (
        <div className="card list" aria-label="食物列表">
          {failed ? (
            <p className="error-text">{answered.error}</p>
          ) : results === null ? (
            <Skeleton layout="rows" />
          ) : results.length === 0 ? (
            <p className="muted">找不到符合的食物</p>
          ) : (
            results.map((food) => (
              <button
                key={food.id}
                type="button"
                className="row food-row"
                onClick={() => onPick(food)}
              >
                <span className="row-name">{food.name}</span>
                <span className="muted food-kcal">
                  每 100 g {food.per100g.kcal} kcal
                </span>
              </button>
            ))
          )}
        </div>
      )}
      <p className="muted food-source">{FOOD_SOURCE_LINE}</p>
    </section>
  );
}
