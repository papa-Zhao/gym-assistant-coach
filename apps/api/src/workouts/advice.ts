import type { WorkoutAdviceResponse } from "@gac/shared";
import type { WorkoutAdvisor } from "../ai/workout-advisor";
import { withAiUse } from "../ai/usage";
import type { Db } from "../users/repo";
import { workoutAdviceContext } from "./advice-context";
import { WorkoutError, getSessionAdvice, saveSessionAdvice } from "./repo";

/** Advice may be asked for this long after the session ended. */
export const ADVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * AI advice for one finished session, cached on the session: a second call
 * returns the stored advice without calling Claude or using the quota. Uses
 * one "chat" (ask AI) use. Throws `not_found`, `not_finished` or `too_old`.
 */
export async function requestWorkoutAdvice(
  deps: { db: Db; advisor: WorkoutAdvisor; now: () => Date },
  userId: string,
  sessionId: string,
): Promise<WorkoutAdviceResponse> {
  const { db } = deps;
  const { endedAt, aiAdvice } = await getSessionAdvice(db, userId, sessionId);
  if (!endedAt) throw new WorkoutError("not_finished");
  if (aiAdvice) return { outcome: "ok", advice: aiAdvice };
  const now = deps.now();
  if (now.getTime() - endedAt.getTime() > ADVICE_WINDOW_MS) {
    throw new WorkoutError("too_old");
  }

  const context = await workoutAdviceContext(db, userId, sessionId);
  const used = await withAiUse(db, userId, "chat", now, () =>
    deps.advisor.advise(context),
  );
  if (used.kind !== "done") return { outcome: used.kind };
  const r = used.result;
  if (r.kind !== "ok") return { outcome: "refused" };
  const advice = await saveSessionAdvice(db, sessionId, {
    ...r.advice,
    createdAt: now.toISOString(),
  });
  return { outcome: "ok", advice };
}
