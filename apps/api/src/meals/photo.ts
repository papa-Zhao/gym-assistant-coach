import { defaultMealType, taipeiHour, type Meal } from "@gac/shared";
import type { FastifyBaseLogger } from "fastify";
import type { MealParser } from "../ai/meal-parser";
import { InvalidImage, normalizePhoto } from "../photos/image";
import {
  newMealPhotoKey,
  withPhotoDeadline,
  type PhotoStore,
} from "../photos/store";
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
    /** Per-call GCS deadline; tests shorten it. */
    photoTimeoutMs?: number | undefined;
  },
  userId: string,
  image: Buffer,
): Promise<PhotoMealOutcome> {
  let jpeg: Buffer;
  try {
    jpeg = await normalizePhoto(image);
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
    await withPhotoDeadline(
      () => deps.photos.put(key, jpeg),
      deps.photoTimeoutMs,
    );
  } catch (err) {
    deps.log.warn(
      { event: "meal_photo_put_failed", errName: errName(err) },
      "meal photo upload failed",
    );
    return outcome;
  }
  try {
    await addMealPhoto(deps.db, outcome.meal.id, key, now);
  } catch (err) {
    deps.log.warn(
      { event: "meal_photo_link_failed", errName: errName(err) },
      "meal photo link failed",
    );
    try {
      await withPhotoDeadline(
        () => deps.photos.delete(key),
        deps.photoTimeoutMs,
      );
    } catch (cleanupErr) {
      deps.log.warn(
        { event: "meal_photo_cleanup_failed", errName: errName(cleanupErr) },
        "meal photo cleanup failed",
      );
    }
  }
  return outcome;
}
