import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { unusedMealParser, unusedPhotoStore } from "./db";

const notUsed = async (): Promise<never> => {
  throw new Error("not used in this test");
};

const deps: AppDeps = {
  db: {} as AppDeps["db"],
  verifyServiceToken: notUsed,
  botServiceAccount: "bot@example.iam.gserviceaccount.com",
  verifyLineIdToken: notUsed,
  notifyWorkoutFinished: async () => {},
  mealParser: unusedMealParser,
  photoStore: unusedPhotoStore,
  sessionSecret: new Uint8Array(32),
  corsOrigin: "http://localhost",
  now: () => new Date("2026-10-19T04:00:00Z"),
};

describe("GET /health", () => {
  const app = buildApp(deps);
  afterAll(() => app.close());

  it("returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", service: "api" });
  });
});
