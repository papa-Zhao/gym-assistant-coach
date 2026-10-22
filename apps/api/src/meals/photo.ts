import { defaultMealType, taipeiHour, type Meal } from "@gac/shared";
import type { FastifyBaseLogger } from "fastify";
import type { MealParser } from "../ai/meal-parser";
import { InvalidImage, normalizeMealImage } from "../photos/image";
import { newMealPhotoKey, type PhotoStore } from "../photos/store";
import type { Db } from "../users/repo";
import { addMealPhoto } from "./repo";
import { runAiMeal } from "./text";

export type PhotoMealOutcome =
  | { kind: "draft"; meal: Meal }
  | { kind: "invalid_image" }
  | { kind: "limit" }
  | { kind: "not_food" }
  | { kind: "refused" }
  | { kind: "unavailable" };

/** Error class name only: storage error text can carry object keys. */
export const errName = (err: unknown) =>
  err instanceof Error ? err.name : "unknown";

/**
 * Normalizes the image (a bad one costs no use), parses it, and only when it
 * is food uploads the photo and stores the draft. A failed upload still
 * returns the draft, just without a photo.
 */
export async function logMealFromPhoto(
  deps: {
    db: Db;
    parser: MealParser;
    photos: PhotoStore;
    now: () => Date;
    log: FastifyBaseLogger;
  },
  userId: string,
  image: Buffer,
): Promise<PhotoMealOutcome> {
  let jpeg: Buffer;
  try {
    jpeg = await normalizeMealImage(image);
  } catch (err) {
    if (err instanceof InvalidImage) return { kind: "invalid_image" };
    throw err;
  }

  const now = deps.now();
  const outcome = await runAiMeal(
    deps,
    userId,
    "photo",
    now,
    defaultMealType(taipeiHour(now)),
    () => deps.parser.parsePhoto(jpeg),
  );
  if (outcome.kind !== "draft") return outcome;

  const key = newMealPhotoKey(userId);
  try {
    await deps.photos.put(key, jpeg);
  } catch (err) {
    deps.log.warn(
      { event: "meal_photo_put_failed", errName: errName(err) },
      "meal photo upload failed",
    );
    return outcome;
  }
  await addMealPhoto(deps.db, outcome.meal.id, key, now);
  return outcome;
}
