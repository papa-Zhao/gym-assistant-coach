import type { AskResponse } from "@gac/shared";
import type { Advisor } from "../ai/advisor";
import { withAiUse } from "../ai/usage";
import type { Db } from "../users/repo";
import { adviceText, shapeAdvice } from "./advice";
import { buildAskContext, loadAskContext, todayLine } from "./context";
import { appendExchange, purgeExpiredMessages, recentTurns } from "./repo";

/** One question to the coach: counts a daily use, answers, and keeps the exchange. */
export async function askCoach(
  deps: { db: Db; advisor: Advisor; now: () => Date },
  userId: string,
  question: string,
): Promise<AskResponse> {
  const { db, advisor } = deps;
  const now = deps.now();
  await purgeExpiredMessages(db, now);

  let data: Awaited<ReturnType<typeof loadAskContext>> | undefined;
  const outcome = await withAiUse(db, userId, "chat", now, async () => {
    data = await loadAskContext(db, userId, now);
    const history = await recentTurns(db, userId, now);
    return advisor.ask({
      context: buildAskContext(data),
      history,
      question,
      library: [],
    });
  });

  if (outcome.kind !== "done") return { outcome: outcome.kind };
  const result = outcome.result;
  if (result.kind === "refused") return { outcome: "refused" };
  if (result.kind === "invalid" || !data) return { outcome: "unavailable" };

  const advice = shapeAdvice(result.advice, {
    question,
    floorKcal: data.floorKcal,
    todayLine: todayLine(data),
  });
  await appendExchange(
    db,
    userId,
    question,
    adviceText(advice),
    { input: result.usage.input, output: result.usage.output },
    now,
  );
  return { outcome: "answer", advice };
}
