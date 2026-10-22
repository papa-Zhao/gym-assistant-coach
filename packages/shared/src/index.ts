// Types and constants shared by apps/api and apps/liff.
// Source-only package: consumers bundle it (tsup for api, Vite for liff).

export const APP_NAME = "Gym Assistant Coach";

export interface HealthResponse {
  status: "ok";
  service: string;
}

export * from "./tokens";
export * from "./auth";
export * from "./targets";
export * from "./profile";
export * from "./metrics";
export * from "./workouts";
export * from "./meals";
export * from "./ask";
