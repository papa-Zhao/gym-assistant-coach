import type { Db } from "../users/repo";

/**
 * Whether the user may ask the AI coach about a finished workout. This is the
 * only control point: the finish summary's `aiAdviceAvailable` and
 * `POST /workouts/:id/advice` both ask it. Everyone may, for now.
 */
export async function canUseWorkoutAiAdvice(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- for future rules (plan, membership)
  _deps: { db: Db },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- for future rules (plan, membership)
  _userId: string,
): Promise<boolean> {
  return true;
}
