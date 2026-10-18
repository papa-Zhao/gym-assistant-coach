export const CONSENT_VERSION = "2026-10-19";

export const CONSENT_DOCS = ["terms", "privacy", "age_18_plus"] as const;

export type ConsentDoc = (typeof CONSENT_DOCS)[number];

export interface SyncUserResponse {
  userId: string;
  consented: boolean;
}

export interface LiffAuthResponse {
  accessToken: string;
  expiresIn: number;
  displayName: string;
}

export interface MeResponse {
  displayName: string;
}

export interface ApiError {
  error: "consent_required" | "unauthorized" | "bad_request";
}
