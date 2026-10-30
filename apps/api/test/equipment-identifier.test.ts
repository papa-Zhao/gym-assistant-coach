import Anthropic from "@anthropic-ai/sdk";
import {
  EQUIPMENT,
  EQUIPMENT_LABELS,
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  type Exercise,
} from "@gac/shared";
import type { FastifyBaseLogger } from "fastify";
import { describe, expect, it } from "vitest";
import { EQUIPMENT_PHOTO_MAX_TOKENS } from "../src/ai/config";
import { AiUnavailable } from "../src/ai/structured-call";
import {
  createEquipmentIdentifier,
  equipmentSchema,
  equipmentSystemPrompt,
} from "../src/ai/equipment-identifier";

function ex(
  slug: string,
  nameZh: string,
  muscleGroup: Exercise["muscleGroup"],
  equipment: Exercise["equipment"],
): Exercise {
  return {
    id: `id-${slug}`,
    slug,
    nameZh,
    nameEn: null,
    kind: muscleGroup ? "strength" : "cardio",
    muscleGroup,
    equipment,
    equipmentCategory: "machine",
    isCustom: false,
    photoUrl: null,
  };
}

const LIBRARY: Exercise[] = [
  ex("barbell-bench-press", "槓鈴臥推", "chest", "barbell"),
  ex("lat-pulldown", "滑輪下拉", "back", "cable"),
  ex("treadmill-run", "跑步機跑步", null, "treadmill"),
];

const JPEG = Buffer.from("fake-jpeg-bytes-for-equipment-test-0123456789");
const B64 = JPEG.toString("base64");

const GOOD_JSON = JSON.stringify({
  is_equipment: true,
  equipment: "cable",
  name_zh: "滑輪下拉機",
  muscle_group: "back",
  candidates: ["lat-pulldown"],
});

function message(content: unknown[], overrides: { stop_reason?: string } = {}) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content,
    stop_reason: overrides.stop_reason ?? "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 80,
      cache_creation_input_tokens: null,
    },
  };
}

function setup(result: () => unknown) {
  const calls: Record<string, unknown>[] = [];
  const logs: unknown[] = [];
  const client = {
    messages: {
      create: async (params: Record<string, unknown>) => {
        calls.push(params);
        return result();
      },
    },
  } as unknown as Anthropic;
  const record = (...args: unknown[]) => void logs.push(args);
  const log = {
    info: record,
    warn: record,
    error: record,
  } as unknown as FastifyBaseLogger;
  return { identifier: createEquipmentIdentifier(client, log), calls, logs };
}

type Req = {
  model: string;
  max_tokens: number;
  output_config: {
    effort: string;
    format: {
      type: string;
      schema: { properties: { candidates: { items: { enum: string[] } } } };
    };
  };
  system: { text: string; cache_control: unknown }[];
  messages: { content: unknown[] }[];
};

describe("equipment identifier", () => {
  it("sends the expected request", async () => {
    const { identifier, calls } = setup(() =>
      message([{ type: "text", text: GOOD_JSON }]),
    );
    await identifier.identify(JPEG, LIBRARY);
    const req = calls[0] as unknown as Req;
    expect(req.model).toBe("claude-haiku-5-5");
    expect(req.max_tokens).toBe(EQUIPMENT_PHOTO_MAX_TOKENS);
    expect(req.output_config.effort).toBe("low");
    expect(req.output_config.format.type).toBe("json_schema");
    expect(
      req.output_config.format.schema.properties.candidates.items.enum,
    ).toEqual(LIBRARY.map((e) => e.slug));
    expect(req.system[0]!.cache_control).toEqual({ type: "ephemeral" });
    for (const e of LIBRARY) expect(req.system[0]!.text).toContain(e.slug!);
    expect(req.messages[0]!.content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: B64 },
    });
    expect("temperature" in req).toBe(false);
  });

  it("builds identical system and schema for the same library", async () => {
    const { identifier, calls } = setup(() =>
      message([{ type: "text", text: GOOD_JSON }]),
    );
    await identifier.identify(JPEG, LIBRARY);
    await identifier.identify(JPEG, [...LIBRARY]);
    const [a, b] = calls as unknown as Req[];
    expect(b!.system).toEqual(a!.system);
    expect(b!.output_config.format.schema).toEqual(
      a!.output_config.format.schema,
    );
    expect(b!.output_config.format.schema).toBe(a!.output_config.format.schema);
  });

  it("formats library lines with Chinese labels and a dash for cardio", () => {
    const prompt = equipmentSystemPrompt(LIBRARY);
    expect(prompt).toContain(
      `barbell-bench-press｜槓鈴臥推｜${EQUIPMENT_LABELS.barbell}｜${MUSCLE_GROUP_LABELS.chest}`,
    );
    expect(prompt).toContain(
      `treadmill-run｜跑步機跑步｜${EQUIPMENT_LABELS.treadmill}｜—`,
    );
    expect(prompt).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("rebuilds when a name changes and drops null-slug rows", () => {
    const renamed = [
      { ...LIBRARY[0]!, nameZh: "改名臥推" },
      ...LIBRARY.slice(1),
    ];
    expect(equipmentSystemPrompt(renamed)).not.toBe(
      equipmentSystemPrompt(LIBRARY),
    );
    expect(equipmentSystemPrompt(renamed)).toContain("改名臥推");
    const withNull = [
      ...LIBRARY,
      { ...LIBRARY[0]!, slug: null, nameZh: "無代號" },
    ];
    const schema = equipmentSchema(withNull) as {
      properties: { candidates: { items: { enum: string[] } } };
    };
    expect(schema.properties.candidates.items.enum).toEqual(
      LIBRARY.map((e) => e.slug),
    );
    expect(equipmentSystemPrompt(withNull)).not.toContain("無代號");
    expect(Object.isFrozen(schema.properties.candidates.items.enum)).toBe(true);
  });

  it("schema lists the enums and requires every field", () => {
    const schema = equipmentSchema(LIBRARY) as {
      properties: Record<string, { enum?: string[] }>;
      required: string[];
      additionalProperties: boolean;
    };
    expect(schema.properties.equipment!.enum).toEqual([...EQUIPMENT]);
    expect(schema.properties.muscle_group!.enum).toEqual([
      ...MUSCLE_GROUPS,
      "none",
    ]);
    expect([...schema.required].sort()).toEqual(
      [
        "candidates",
        "equipment",
        "is_equipment",
        "muscle_group",
        "name_zh",
      ].sort(),
    );
    expect(schema.additionalProperties).toBe(false);
  });

  it("returns a guess with camelCase fields", async () => {
    const { identifier } = setup(() =>
      message([{ type: "text", text: GOOD_JSON }]),
    );
    expect(await identifier.identify(JPEG, LIBRARY)).toEqual({
      kind: "guess",
      guess: {
        isEquipment: true,
        equipment: "cable",
        nameZh: "滑輪下拉機",
        muscleGroup: "back",
        candidates: ["lat-pulldown"],
      },
      usage: { input: 100, output: 50, cacheRead: 80, cacheCreation: 0 },
    });
  });

  it("returns not_equipment for is_equipment false", async () => {
    const { identifier } = setup(() =>
      message([
        {
          type: "text",
          text: JSON.stringify({
            is_equipment: false,
            equipment: "none",
            name_zh: "",
            muscle_group: "none",
            candidates: [],
          }),
        },
      ]),
    );
    expect((await identifier.identify(JPEG, LIBRARY)).kind).toBe(
      "not_equipment",
    );
  });

  it("returns refused on refusal", async () => {
    const { identifier } = setup(() => message([], { stop_reason: "refusal" }));
    expect((await identifier.identify(JPEG, LIBRARY)).kind).toBe("refused");
  });

  it("returns not_equipment on max_tokens, non-JSON and wrong shape", async () => {
    const cases = [
      message([{ type: "text", text: GOOD_JSON }], {
        stop_reason: "max_tokens",
      }),
      message([{ type: "text", text: "not json" }]),
      message([{ type: "text", text: JSON.stringify({ is_equipment: true }) }]),
    ];
    for (const c of cases) {
      const { identifier } = setup(() => c);
      expect((await identifier.identify(JPEG, LIBRARY)).kind).toBe(
        "not_equipment",
      );
    }
  });

  it("throws AiUnavailable on connection errors", async () => {
    const { identifier } = setup(() => {
      throw new Anthropic.APIConnectionError({ message: "down" });
    });
    await expect(identifier.identify(JPEG, LIBRARY)).rejects.toBeInstanceOf(
      AiUnavailable,
    );
  });

  it("logs kind equipment and imageBytes but no image data, slugs or names", async () => {
    const { identifier, logs } = setup(() =>
      message([{ type: "text", text: GOOD_JSON }]),
    );
    await identifier.identify(JPEG, LIBRARY);
    const out = JSON.stringify(logs);
    expect(out).not.toContain(B64.slice(0, 20));
    expect(out).not.toContain("lat-pulldown");
    expect(out).not.toContain("滑輪下拉");
    expect(logs).toHaveLength(1);
    expect((logs[0] as unknown[])[0]).toMatchObject({
      event: "ai_call",
      kind: "equipment",
      imageBytes: JPEG.length,
      stopReason: "end_turn",
    });
  });
});
