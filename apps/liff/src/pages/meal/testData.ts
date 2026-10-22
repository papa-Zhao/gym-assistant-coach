import type { Food, Meal } from "@gac/shared";

export const RICE: Food = {
  id: "f-rice",
  source: "tfda",
  name: "白飯",
  aliases: null,
  category: "穀物類",
  per100g: { kcal: 130, proteinG: 2.7, carbG: 28.2, fatG: 0.3 },
};

export function meal(over: Partial<Meal> = {}): Meal {
  return {
    id: "m1",
    eatenOn: "2026-10-22",
    mealType: "lunch",
    status: "confirmed",
    source: "manual",
    items: [
      {
        id: "i1",
        foodId: "f-rice",
        name: "白飯",
        grams: 180,
        kcal: 234,
        proteinG: 4.9,
        carbG: 50.8,
        fatG: 0.5,
        aiConfidence: null,
      },
    ],
    total: { kcal: 234, proteinG: 4.9, carbG: 50.8, fatG: 0.5 },
    ...over,
  };
}
