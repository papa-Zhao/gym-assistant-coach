import type {
  ActiveSession,
  Exercise,
  FinishSummary,
  SessionItem,
} from "@gac/shared";
import { configureApi } from "../../api";

export interface Call {
  method: string;
  path: string;
  body: unknown;
}

type Handler = (call: Call) => unknown;

/** Routes every API call to `handler` and records it; a `Response` passes through. */
export function fakeApi(handler: Handler): Call[] {
  const calls: Call[] = [];
  configureApi({
    apiUrl: "https://api.test",
    fetchImpl: (async (url: string, init?: RequestInit) => {
      const call: Call = {
        method: init?.method ?? "GET",
        path: url.replace("https://api.test", ""),
        body: !init?.body
          ? undefined
          : init.body instanceof Blob
            ? init.body
            : JSON.parse(String(init.body)),
      };
      calls.push(call);
      const out = handler(call);
      if (out instanceof Response) return out;
      if (out === undefined) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(out));
    }) as unknown as typeof fetch,
    relogin: async () => ({ kind: "error" }),
  });
  return calls;
}

export const BENCH: Exercise = {
  id: "ex-bench",
  slug: "barbell-bench-press",
  nameZh: "槓鈴臥推",
  nameEn: "Barbell Bench Press",
  kind: "strength",
  muscleGroup: "chest",
  equipment: "barbell",
  equipmentCategory: "free_weight",
  isCustom: false,
  photoUrl: null,
};

export const TREADMILL: Exercise = {
  id: "ex-tread",
  slug: "treadmill-run",
  nameZh: "跑步機",
  nameEn: "Treadmill",
  kind: "cardio",
  muscleGroup: null,
  equipment: "treadmill",
  equipmentCategory: "cardio_equipment",
  isCustom: false,
  photoUrl: null,
};

export function strengthItem(over: Partial<SessionItem> = {}): SessionItem {
  return {
    exercise: BENCH,
    targetSets: null,
    targetReps: null,
    last: null,
    hint: null,
    sets: [],
    ...over,
  } as SessionItem;
}

export function session(
  items: SessionItem[],
  over: Partial<ActiveSession> = {},
): ActiveSession {
  return {
    id: "s1",
    date: "2026-10-20",
    startedAt: new Date().toISOString(),
    templateId: null,
    templateName: null,
    items,
    ...over,
  };
}

export const SUMMARY: FinishSummary = {
  sessionId: "s1",
  volumeKg: 1920,
  exerciseCount: 2,
  setCount: 6,
  cardioMinutes: 0,
  avgRestSec: null,
  prs: [
    {
      exerciseId: "ex-bench",
      nameZh: "槓鈴臥推",
      nameEn: "Barbell Bench Press",
      e1rm: 101.3,
      weightKg: 80,
      reps: 8,
    },
  ],
  notified: true,
};
