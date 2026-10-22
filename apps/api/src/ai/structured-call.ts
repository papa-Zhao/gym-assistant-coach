import Anthropic from "@anthropic-ai/sdk";
import type { FastifyBaseLogger } from "fastify";
import { AI_MODEL } from "./config";
import type { AiTokenUsage } from "./usage";

/** Thrown on network errors, timeouts, 429, 5xx and any other API error. */
export class AiUnavailable extends Error {}

export type StructuredResult<T> =
  | { kind: "ok"; value: T; usage: AiTokenUsage }
  | { kind: "invalid"; usage: AiTokenUsage } // max_tokens, non-JSON, parser returned null
  | { kind: "refused"; usage: AiTokenUsage };

export interface StructuredSpec {
  kind: string;
  system: string;
  schema: object;
  content: Anthropic.MessageParam["content"];
  maxTokens: number;
  /** Extra log fields; never content. */
  logExtra?: Record<string, number>;
}

export async function callStructured<T>(
  client: Pick<Anthropic, "messages">,
  log: FastifyBaseLogger,
  spec: StructuredSpec,
  parse: (data: unknown) => T | null,
): Promise<StructuredResult<T>> {
  const started = Date.now();
  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: spec.maxTokens,
      system: [
        {
          type: "text",
          text: spec.system,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: spec.content }],
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: spec.schema as Record<string, unknown>,
        },
      },
    });
  } catch (err) {
    const ms = Date.now() - started;
    if (err instanceof Anthropic.APIError) {
      const expected =
        err instanceof Anthropic.APIConnectionError ||
        err instanceof Anthropic.RateLimitError ||
        err instanceof Anthropic.InternalServerError;
      const fields = {
        event: "ai_call",
        kind: spec.kind,
        ...spec.logExtra,
        ms,
        status: err.status,
      };
      if (expected) log.warn(fields, "ai call unavailable");
      else log.error(fields, "ai call failed");
      throw new AiUnavailable("ai unavailable");
    }
    throw err;
  }

  const usage: AiTokenUsage = {
    input: message.usage.input_tokens,
    output: message.usage.output_tokens,
    cacheRead: message.usage.cache_read_input_tokens ?? 0,
    cacheCreation: message.usage.cache_creation_input_tokens ?? 0,
  };
  log.info(
    {
      event: "ai_call",
      kind: spec.kind,
      ...spec.logExtra,
      stopReason: message.stop_reason,
      ms: Date.now() - started,
      inputTokens: usage.input,
      outputTokens: usage.output,
      cacheRead: usage.cacheRead,
      cacheCreation: usage.cacheCreation,
    },
    "ai call",
  );

  if (message.stop_reason === "refusal") return { kind: "refused", usage };
  if (message.stop_reason === "max_tokens") return { kind: "invalid", usage };

  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return { kind: "invalid", usage };
  let data: unknown;
  try {
    data = JSON.parse(block.text);
  } catch {
    return { kind: "invalid", usage };
  }
  const value = parse(data);
  if (value === null) return { kind: "invalid", usage };
  return { kind: "ok", value, usage };
}
