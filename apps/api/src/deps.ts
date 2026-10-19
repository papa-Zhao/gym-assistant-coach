import type { Db } from "./users/repo";

/** Verifies a Google ID token; rejects on bad signature, audience or unverified email. */
export type VerifyServiceToken = (token: string) => Promise<{ email: string }>;

/** Verifies a LINE ID token; rejects when invalid. */
export type VerifyLineIdToken = (
  idToken: string,
) => Promise<{ sub: string; name: string | null }>;

export interface AppDeps {
  db: Db;
  verifyServiceToken: VerifyServiceToken;
  botServiceAccount: string;
  verifyLineIdToken: VerifyLineIdToken;
  sessionSecret: Uint8Array;
  corsOrigin: string;
  /** Current time; injectable so tests can pin the Taipei date. */
  now: () => Date;
}
