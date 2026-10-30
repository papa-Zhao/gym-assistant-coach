export const CONSENT_VERSION = "2026-10-30";

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
  error:
    | "consent_required"
    | "unauthorized"
    | "bad_request"
    | "not_found"
    | "conflict"
    | "internal"
    | "payload_too_large"
    | "unsupported_media_type"
    | "invalid_image"
    | "rate_limited"
    // Meal input errors (see MealInputErrorCode in the api).
    | "invalid_grams"
    | "unknown_food"
    | "unknown_item"
    | "empty"
    | "too_many";
}
