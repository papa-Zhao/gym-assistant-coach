import type { FinishSummary } from "@gac/shared";
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
  sessionSecret: Uint8Array;
  corsOrigin: string;
  /** Current time; injectable so tests can pin the Taipei date. */
  now: () => Date;
  /** How long finish waits for the bot notification; defaults to 5000. */
  notifyTimeoutMs?: number;
}
