import type Anthropic from "@anthropic-ai/sdk";
import type { FastifyBaseLogger } from "fastify";
import type { ChatTurn } from "../ask/repo";
import { ASK_MAX_TOKENS } from "./config";
import { ASK_SCHEMA, ASK_SYSTEM } from "./prompts";
import { callStructured } from "./structured-call";
import type { AiTokenUsage } from "./usage";

export interface RawAdvice {
  title: string;
  items: { name: string; detail: string }[];
  body: string;
}

export type AdvisorResult =
  | { kind: "ok"; advice: RawAdvice; usage: AiTokenUsage }
  | { kind: "invalid"; usage: AiTokenUsage }
  | { kind: "refused"; usage: AiTokenUsage };

export interface Advisor {
  /** `context` is the user-data block; `history` alternates user/assistant, oldest first. */
  ask(input: {
    context: string;
    history: ChatTurn[];
    question: string;
  }): Promise<AdvisorResult>;
}

function parseAdvice(data: unknown): RawAdvice | null {
  if (typeof data !== "object" || data === null) return null;
  const { title, items, body } = data as Record<string, unknown>;
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
  return { title, items: parsed, body };
}

export function createAdvisor(
  client: Pick<Anthropic, "messages">,
  log: FastifyBaseLogger,
): Advisor {
  return {
    async ask({ context, history, question }) {
      const r = await callStructured(
        client,
        log,
        {
          kind: "chat",
          system: ASK_SYSTEM,
          schema: ASK_SCHEMA,
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
