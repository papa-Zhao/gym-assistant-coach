import type { FinishSummary } from "@gac/shared";
import type { Advisor } from "./ai/advisor";
import type { EquipmentIdentifier } from "./ai/equipment-identifier";
import type { MealParser } from "./ai/meal-parser";
import type { DbStats } from "./db/timing.js";
import type { PhotoStore } from "./photos/store";
import type { Db } from "./users/repo";

/** Verifies a Google ID token; rejects on bad signature, audience or unverified email. */
export type VerifyServiceToken = (token: string) => Promise<{ email: string }>;

/** Verifies a LINE ID token; rejects when invalid. */
export type VerifyLineIdToken = (
  idToken: string,
) => Promise<{ sub: string; name: string | null }>;

/** Pushes the finish summary to the user via the bot; rejects on any failure. */
export type NotifyWorkoutFinished = (
  lineUserId: string,
  summary: FinishSummary,
  templateName: string | null,
) => Promise<void>;

export interface AppDeps {
  db: Db;
  verifyServiceToken: VerifyServiceToken;
  botServiceAccount: string;
  verifyLineIdToken: VerifyLineIdToken;
  notifyWorkoutFinished: NotifyWorkoutFinished;
  /** Turns meal text into estimated items; tests inject a fake. */
  mealParser: MealParser;
  /** Names gym equipment from a photo; tests inject a fake. */
  equipmentIdentifier: EquipmentIdentifier;
  /** Answers free-form coaching questions; tests inject a fake. */
  advisor: Advisor;
  /** Meal photo object storage; tests inject an in-memory one. */
  photoStore: PhotoStore;
  /** Per-call GCS deadline override; tests only. */
  photoTimeoutMs?: number;
  sessionSecret: Uint8Array;
  corsOrigin: string;
  /** Current time; injectable so tests can pin the Taipei date. */
  now: () => Date;
  /** How long finish waits for the bot notification; defaults to 5000. */
  notifyTimeoutMs?: number;
  /** Database stats of the request being logged; defaults to the instrumented client's counts. Injectable for tests. */
  dbStats?: () => DbStats;
}
