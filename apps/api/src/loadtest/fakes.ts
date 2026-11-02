import { timingSafeEqual } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import type { ParseResult } from "../ai/meal-parser";
import type { AiTokenUsage } from "../ai/usage";
import type { AppDeps } from "../deps";

// Load testing only (loadtest-server.ts). Never import from server.ts.

export const LOADTEST_BOT_SA = "loadtest-bot@loadtest.invalid";
/** No fake token ever verifies as this, so /jobs always rejects. */
export const LOADTEST_SCHEDULER_SA = "loadtest-scheduler@loadtest.invalid";
/** k6 (loadtest/api.js) signs in with `loadtest:<LINE user id>`. */
export const FAKE_LINE_TOKEN_PREFIX = "loadtest:";

/** Fixed so the cost records have plausible numbers. */
const FAKE_USAGE: AiTokenUsage = {
  input: 1500,
  output: 300,
  cacheRead: 0,
  cacheCreation: 0,
};

const FAKE_MEAL: ParseResult = {
  kind: "items",
  items: [
    {
      name: "白飯",
      grams: 200,
      kcal: 280,
      proteinG: 5,
      carbG: 62,
      fatG: 0.5,
      confidence: 0.8,
    },
    {
      name: "滷雞腿",
      grams: 150,
      kcal: 320,
      proteinG: 30,
      carbG: 2,
      fatG: 21,
      confidence: 0.7,
    },
  ],
  usage: FAKE_USAGE,
};

export function createFakeDeps(opts: {
  internalToken: string;
  aiDelayMs: number;
}): Pick<
  AppDeps,
  | "verifyServiceToken"
  | "botServiceAccount"
  | "schedulerServiceAccount"
  | "verifyLineIdToken"
  | "notifyWorkoutFinished"
  | "mealParser"
  | "equipmentIdentifier"
  | "advisor"
  | "workoutAdvisor"
  | "photoStore"
> {
  const expected = Buffer.from(opts.internalToken);
  const delay = () => sleep(opts.aiDelayMs);

  return {
    verifyServiceToken: async (token) => {
      const got = Buffer.from(token);
      if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
        throw new Error("invalid load-test token");
      }
      return { email: LOADTEST_BOT_SA };
    },
    botServiceAccount: LOADTEST_BOT_SA,
    schedulerServiceAccount: LOADTEST_SCHEDULER_SA,
    verifyLineIdToken: async (idToken) => {
      const sub = idToken.startsWith(FAKE_LINE_TOKEN_PREFIX)
        ? idToken.slice(FAKE_LINE_TOKEN_PREFIX.length)
        : "";
      if (!sub) throw new Error("invalid load-test LINE token");
      return { sub, name: `壓測 ${sub}` };
    },
    notifyWorkoutFinished: async () => {},
    mealParser: {
      parseText: async () => {
        await delay();
        return FAKE_MEAL;
      },
      parsePhoto: async () => {
        await delay();
        return FAKE_MEAL;
      },
    },
    equipmentIdentifier: {
      identify: async (_jpeg, library) => {
        await delay();
        const first = library[0];
        if (!first) return { kind: "not_equipment", usage: FAKE_USAGE };
        return {
          kind: "guess",
          guess: {
            isEquipment: true,
            equipment: first.equipment,
            nameZh: first.nameZh,
            muscleGroup: first.muscleGroup ?? "none",
            candidates: first.slug ? [first.slug] : [],
          },
          usage: FAKE_USAGE,
        };
      },
    },
    advisor: {
      ask: async () => {
        await delay();
        return {
          kind: "ok",
          advice: {
            title: "壓測回覆",
            items: [{ name: "暖身", detail: "先做 5 分鐘有氧。" }],
            body: "這是壓測用的固定回覆。",
            program: [],
          },
          usage: FAKE_USAGE,
        };
      },
    },
    workoutAdvisor: {
      advise: async () => {
        await delay();
        return {
          kind: "ok",
          advice: { title: "壓測建議", points: ["這是壓測用的固定建議。"] },
          usage: FAKE_USAGE,
        };
      },
    },
    photoStore: {
      put: async () => {},
      signedUrl: async () => "https://loadtest.invalid/photo.jpg",
      delete: async () => {},
      deletePrefix: async () => {},
    },
  };
}
