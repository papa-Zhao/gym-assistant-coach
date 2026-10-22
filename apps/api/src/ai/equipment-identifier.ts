import type Anthropic from "@anthropic-ai/sdk";
import {
  EQUIPMENT,
  EQUIPMENT_LABELS,
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  type Exercise,
} from "@gac/shared";
import type { FastifyBaseLogger } from "fastify";
import { EQUIPMENT_PHOTO_MAX_TOKENS } from "./config";
import { EQUIPMENT_SYSTEM_HEAD } from "./prompts";
import { callStructured } from "./structured-call";
import type { AiTokenUsage } from "./usage";

export interface EquipmentGuess {
  isEquipment: boolean;
  /** Unvalidated; the service layer checks it. */
  equipment: string;
  nameZh: string;
  /** Unvalidated; "none" means no muscle group. */
  muscleGroup: string;
  /** Unvalidated slugs. */
  candidates: string[];
}

export type IdentifyResult =
  | { kind: "guess"; guess: EquipmentGuess; usage: AiTokenUsage }
  | { kind: "not_equipment"; usage: AiTokenUsage }
  | { kind: "refused"; usage: AiTokenUsage };

export interface EquipmentIdentifier {
  /** Throws AiUnavailable. `library` must be the same list on every call for caching. */
  identify(jpeg: Buffer, library: Exercise[]): Promise<IdentifyResult>;
}

interface Built {
  key: string;
  system: string;
  schema: object;
}

// Single entry, replaced when the library content changes, so the same
// library always yields the same strings and objects (stable cache prefix).
let cached: Built | undefined;

function deepFreeze<T extends object>(o: T): T {
  for (const v of Object.values(o)) {
    if (typeof v === "object" && v !== null) deepFreeze(v);
  }
  return Object.freeze(o);
}

function build(library: Exercise[]): Built {
  const rows = library.filter(
    (e): e is Exercise & { slug: string } => e.slug !== null,
  );
  const key = rows
    .map((e) => [e.slug, e.nameZh, e.equipment, e.muscleGroup ?? ""].join("|"))
    .join("\n");
  if (cached?.key === key) return cached;
  const slugs = rows.map((e) => e.slug);
  const lines = rows.map((e) =>
    [
      e.slug,
      e.nameZh,
      EQUIPMENT_LABELS[e.equipment],
      e.muscleGroup ? MUSCLE_GROUP_LABELS[e.muscleGroup] : "—",
    ].join("｜"),
  );
  cached = {
    key,
    system: `${EQUIPMENT_SYSTEM_HEAD}\n${lines.join("\n")}`,
    schema: deepFreeze({
      type: "object",
      properties: {
        is_equipment: { type: "boolean" },
        equipment: { type: "string", enum: [...EQUIPMENT] },
        name_zh: { type: "string" },
        muscle_group: { type: "string", enum: [...MUSCLE_GROUPS, "none"] },
        candidates: {
          type: "array",
          items: { type: "string", enum: slugs },
        },
      },
      required: [
        "is_equipment",
        "equipment",
        "name_zh",
        "muscle_group",
        "candidates",
      ],
      additionalProperties: false,
    }),
  };
  return cached;
}

export function equipmentSystemPrompt(library: Exercise[]): string {
  return build(library).system;
}

export function equipmentSchema(library: Exercise[]): object {
  return build(library).schema;
}

function parseGuess(data: unknown): EquipmentGuess | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (
    typeof d.is_equipment !== "boolean" ||
    typeof d.equipment !== "string" ||
    typeof d.name_zh !== "string" ||
    typeof d.muscle_group !== "string" ||
    !Array.isArray(d.candidates) ||
    !d.candidates.every((c) => typeof c === "string")
  ) {
    return null;
  }
  return {
    isEquipment: d.is_equipment,
    equipment: d.equipment,
    nameZh: d.name_zh,
    muscleGroup: d.muscle_group,
    candidates: d.candidates as string[],
  };
}

export function createEquipmentIdentifier(
  client: Pick<Anthropic, "messages">,
  log: FastifyBaseLogger,
): EquipmentIdentifier {
  return {
    async identify(jpeg, library) {
      const { system, schema } = build(library);
      const r = await callStructured(
        client,
        log,
        {
          kind: "equipment",
          system,
          schema,
          maxTokens: EQUIPMENT_PHOTO_MAX_TOKENS,
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: jpeg.toString("base64"),
              },
            },
            { type: "text", text: "這是健身房的一台器材。" },
          ],
          logExtra: { imageBytes: jpeg.length },
        },
        parseGuess,
      );
      if (r.kind === "refused") return r;
      if (r.kind === "invalid" || !r.value.isEquipment) {
        return { kind: "not_equipment", usage: r.usage };
      }
      return { kind: "guess", guess: r.value, usage: r.usage };
    },
  };
}
