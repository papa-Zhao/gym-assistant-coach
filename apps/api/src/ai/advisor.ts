import type Anthropic from "@anthropic-ai/sdk";
import type { Exercise } from "@gac/shared";
import type { FastifyBaseLogger } from "fastify";
import type { ChatTurn } from "../ask/repo";
import { ASK_MAX_TOKENS } from "./config";
import { deepFreeze, libraryView } from "./library";
import { ASK_SYSTEM_HEAD } from "./prompts";
import { callStructured } from "./structured-call";
import type { AiTokenUsage } from "./usage";

export interface RawProgramDay {
  name: string;
  exercises: { slug: string; sets: number; reps: number }[];
}

export interface RawAdvice {
  title: string;
  items: { name: string; detail: string }[];
  body: string;
  program: RawProgramDay[];
}

export type AdvisorResult =
  | { kind: "ok"; advice: RawAdvice; usage: AiTokenUsage }
  | { kind: "invalid"; usage: AiTokenUsage }
  | { kind: "refused"; usage: AiTokenUsage };

export interface Advisor {
  /**
   * `context` is the user-data block; `history` alternates user/assistant,
   * oldest first. `library` must be the same list on every call for caching
   * (strength built-ins, slug order).
   */
  ask(input: {
    context: string;
    history: ChatTurn[];
    question: string;
    library: Exercise[];
  }): Promise<AdvisorResult>;
}

interface Built {
  key: string;
  system: string;
  schema: object;
}

// Single entry, replaced when the library content changes, so the same
// library always yields the same string and object (stable cache prefix).
let cached: Built | undefined;

function build(library: Exercise[]): Built {
  const { key, slugs, lines } = libraryView(library);
  if (cached?.key === key) return cached;
  cached = {
    key,
    system: `${ASK_SYSTEM_HEAD}\n${lines.join("\n")}`,
    schema: deepFreeze({
      type: "object",
      additionalProperties: false,
      required: ["title", "items", "body", "program"],
      properties: {
        title: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "detail"],
            properties: {
              name: { type: "string" },
              detail: { type: "string" },
            },
          },
        },
        body: { type: "string" },
        program: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "exercises"],
            properties: {
              name: { type: "string" },
              exercises: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["slug", "sets", "reps"],
                  properties: {
                    slug: { type: "string", enum: slugs },
                    sets: { type: "integer" },
                    reps: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    }),
  };
  return cached;
}

/** Same library always yields the same string (stable cache prefix). */
export function askSystemPrompt(library: Exercise[]): string {
  return build(library).system;
}

/** Same library always yields the same frozen object. */
export function askSchema(library: Exercise[]): object {
  return build(library).schema;
}

function parseProgram(raw: unknown): RawProgramDay[] | null {
  if (!Array.isArray(raw)) return null;
  const days: RawProgramDay[] = [];
  for (const d of raw) {
    if (typeof d !== "object" || d === null) return null;
    const { name, exercises } = d as Record<string, unknown>;
    if (typeof name !== "string" || !Array.isArray(exercises)) return null;
    const list: RawProgramDay["exercises"] = [];
    for (const e of exercises) {
      if (typeof e !== "object" || e === null) return null;
      const { slug, sets, reps } = e as Record<string, unknown>;
      if (
        typeof slug !== "string" ||
        typeof sets !== "number" ||
        !Number.isFinite(sets) ||
        typeof reps !== "number" ||
        !Number.isFinite(reps)
      ) {
        return null;
      }
      list.push({ slug, sets, reps });
    }
    days.push({ name, exercises: list });
  }
  return days;
}

function parseAdvice(data: unknown): RawAdvice | null {
  if (typeof data !== "object" || data === null) return null;
  const { title, items, body, program } = data as Record<string, unknown>;
  if (
    typeof title !== "string" ||
    typeof body !== "string" ||
    !Array.isArray(items)
  ) {
    return null;
  }
  const parsed: RawAdvice["items"] = [];
  for (const raw of items) {
    if (typeof raw !== "object" || raw === null) return null;
    const { name, detail } = raw as Record<string, unknown>;
    if (typeof name !== "string" || typeof detail !== "string") return null;
    parsed.push({ name, detail });
  }
  const days = parseProgram(program);
  if (!days) return null;
  return { title, items: parsed, body, program: days };
}

export function createAdvisor(
  client: Pick<Anthropic, "messages">,
  log: FastifyBaseLogger,
): Advisor {
  return {
    async ask({ context, history, question, library }) {
      const { system, schema } = build(library);
      const r = await callStructured(
        client,
        log,
        {
          kind: "chat",
          system,
          schema,
          effort: "medium",
          maxTokens: ASK_MAX_TOKENS,
          history: history.map((t) => ({ role: t.role, content: t.content })),
          content: `${context}\n\n使用者問題：${question}`,
        },
        parseAdvice,
      );
      if (r.kind === "ok") {
        return { kind: "ok", advice: r.value, usage: r.usage };
      }
      return r;
    },
  };
}
