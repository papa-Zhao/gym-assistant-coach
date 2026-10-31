import type Anthropic from "@anthropic-ai/sdk";
import { WORKOUT_ADVICE_LIMITS } from "@gac/shared";
import type { FastifyBaseLogger } from "fastify";
import { WORKOUT_ADVICE_MAX_TOKENS } from "./config";
import { deepFreeze } from "./library";
import { WORKOUT_ADVICE_SYSTEM } from "./prompts";
import { callStructured } from "./structured-call";
import type { AiTokenUsage } from "./usage";

export interface RawWorkoutAdvice {
  title: string;
  points: string[];
}

export type WorkoutAdvisorResult =
  | { kind: "ok"; advice: RawWorkoutAdvice; usage: AiTokenUsage }
  | { kind: "invalid" | "refused"; usage: AiTokenUsage };

export interface WorkoutAdvisor {
  /** `context` is the training-data block for one finished session. */
  advise(context: string): Promise<WorkoutAdvisorResult>;
}

const SCHEMA = deepFreeze({
  type: "object",
  additionalProperties: false,
  required: ["title", "points"],
  properties: {
    title: { type: "string" },
    points: { type: "array", items: { type: "string" } },
  },
});

/** Trimmed and cut to `max` code points. */
const clip = (s: string, max: number) =>
  Array.from(s.trim()).slice(0, max).join("").trimEnd();

/** Like {@link clip}, but a cut text ends with "…" (still `max` code points). */
const clipWithEllipsis = (s: string, max: number) => {
  const chars = Array.from(s.trim());
  if (chars.length <= max) return chars.join("");
  return `${chars
    .slice(0, max - 1)
    .join("")
    .trimEnd()}…`;
};

/** Over-long fields are cut; a blank title or no usable point is invalid. */
export function parseWorkoutAdvice(data: unknown): RawWorkoutAdvice | null {
  if (typeof data !== "object" || data === null) return null;
  const { title, points } = data as Record<string, unknown>;
  if (typeof title !== "string" || !Array.isArray(points)) return null;
  if (!points.every((p) => typeof p === "string")) return null;
  const t = clip(title, WORKOUT_ADVICE_LIMITS.titleChars);
  const ps = (points as string[])
    .map((p) => clipWithEllipsis(p, WORKOUT_ADVICE_LIMITS.pointChars))
    .filter((p) => p.length > 0)
    .slice(0, WORKOUT_ADVICE_LIMITS.maxPoints);
  if (t.length === 0 || ps.length === 0) return null;
  return { title: t, points: ps };
}

export function createWorkoutAdvisor(
  client: Pick<Anthropic, "messages">,
  log: FastifyBaseLogger,
): WorkoutAdvisor {
  return {
    async advise(context) {
      const r = await callStructured(
        client,
        log,
        {
          kind: "workout_advice",
          system: WORKOUT_ADVICE_SYSTEM,
          schema: SCHEMA,
          maxTokens: WORKOUT_ADVICE_MAX_TOKENS,
          content: context,
        },
        parseWorkoutAdvice,
      );
      if (r.kind === "ok") {
        return { kind: "ok", advice: r.value, usage: r.usage };
      }
      return r;
    },
  };
}
