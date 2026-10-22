import Anthropic from "@anthropic-ai/sdk";
import type { FastifyBaseLogger } from "fastify";
import { MEAL_PHOTO_MAX_TOKENS, MEAL_TEXT_MAX_TOKENS } from "./config";
import { MEAL_PHOTO_SYSTEM, MEAL_SCHEMA, MEAL_TEXT_SYSTEM } from "./prompts";
import { AiUnavailable, callStructured } from "./structured-call";
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

export { AiUnavailable as MealParserUnavailable };

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

/** Returns null when the data is not in the expected shape. */
function parseItems(data: unknown): ParsedItem[] | null {
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
  logExtra?: Record<string, number>;
}

async function callParser(
  client: MessagesClient,
  log: FastifyBaseLogger,
  spec: CallSpec,
): Promise<ParseResult> {
  const r = await callStructured(
    client,
    log,
    { ...spec, schema: MEAL_SCHEMA },
    parseItems,
  );
  if (r.kind === "refused") return r;
  if (r.kind === "invalid" || r.value.length === 0) {
    return { kind: "not_food", usage: r.usage };
  }
  return { kind: "items", items: r.value, usage: r.usage };
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
