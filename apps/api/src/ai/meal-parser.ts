import Anthropic from "@anthropic-ai/sdk";
import type { FastifyBaseLogger } from "fastify";
import {
  AI_MODEL,
  MEAL_PHOTO_MAX_TOKENS,
  MEAL_TEXT_MAX_TOKENS,
} from "./config";
import { MEAL_PHOTO_SYSTEM, MEAL_SCHEMA, MEAL_TEXT_SYSTEM } from "./prompts";
import type { AiTokenUsage } from "./usage";

export interface ParsedItem {
  name: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  confidence: number;
}

export type ParseResult =
  | { kind: "items"; items: ParsedItem[]; usage: AiTokenUsage }
  | { kind: "not_food"; usage: AiTokenUsage }
  | { kind: "refused"; usage: AiTokenUsage };

export interface MealParser {
  parseText(text: string): Promise<ParseResult>;
  /** `jpeg` is the normalized image from normalizeMealImage. */
  parsePhoto(jpeg: Buffer): Promise<ParseResult>;
}

/** Thrown on network errors, timeouts, 429, 5xx and any other API error. */
export class MealParserUnavailable extends Error {}

type MessagesClient = Pick<Anthropic, "messages">;

interface RawItem {
  name?: unknown;
  grams?: unknown;
  kcal?: unknown;
  protein_g?: unknown;
  carb_g?: unknown;
  fat_g?: unknown;
  confidence?: unknown;
}

function toItem(raw: RawItem): ParsedItem | null {
  const { name, grams, kcal, protein_g, carb_g, fat_g, confidence } = raw;
  if (
    typeof name !== "string" ||
    typeof grams !== "number" ||
    typeof kcal !== "number" ||
    typeof protein_g !== "number" ||
    typeof carb_g !== "number" ||
    typeof fat_g !== "number" ||
    typeof confidence !== "number"
  ) {
    return null;
  }
  return {
    name,
    grams,
    kcal,
    proteinG: protein_g,
    carbG: carb_g,
    fatG: fat_g,
    confidence,
  };
}

/** Returns null when the text is not valid JSON in the expected shape. */
function parseItems(text: string): ParsedItem[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { is_food, items } = data as { is_food?: unknown; items?: unknown };
  if (typeof is_food !== "boolean" || !Array.isArray(items)) return null;
  if (!is_food) return [];
  const parsed: ParsedItem[] = [];
  for (const raw of items) {
    if (typeof raw !== "object" || raw === null) return null;
    const item = toItem(raw as RawItem);
    if (!item) return null;
    parsed.push(item);
  }
  return parsed;
}

interface CallSpec {
  kind: "text" | "photo";
  system: string;
  maxTokens: number;
  content: Anthropic.MessageParam["content"];
  /** Extra log fields; never content. */
  logExtra?: Record<string, unknown>;
}

async function callParser(
  client: MessagesClient,
  log: FastifyBaseLogger,
  spec: CallSpec,
): Promise<ParseResult> {
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
        format: { type: "json_schema", schema: MEAL_SCHEMA },
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
      throw new MealParserUnavailable("meal parser unavailable");
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
  if (message.stop_reason === "max_tokens") return { kind: "not_food", usage };

  const block = message.content.find((b) => b.type === "text");
  const items = block && block.type === "text" ? parseItems(block.text) : null;
  if (!items || items.length === 0) return { kind: "not_food", usage };
  return { kind: "items", items, usage };
}

export function createMealParser(
  client: MessagesClient,
  log: FastifyBaseLogger,
): MealParser {
  return {
    parseText: (text) =>
      callParser(client, log, {
        kind: "text",
        system: MEAL_TEXT_SYSTEM,
        maxTokens: MEAL_TEXT_MAX_TOKENS,
        content: text,
      }),
    parsePhoto: (jpeg) =>
      callParser(client, log, {
        kind: "photo",
        system: MEAL_PHOTO_SYSTEM,
        maxTokens: MEAL_PHOTO_MAX_TOKENS,
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: jpeg.toString("base64"),
            },
          },
          { type: "text", text: "這是我這一餐。" },
        ],
        logExtra: { imageBytes: jpeg.length },
      }),
  };
}
