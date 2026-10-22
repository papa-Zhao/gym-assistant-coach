import Anthropic from "@anthropic-ai/sdk";
import type { FastifyBaseLogger } from "fastify";
import { describe, expect, it } from "vitest";
import { MEAL_PHOTO_MAX_TOKENS, MEAL_TEXT_MAX_TOKENS } from "../src/ai/config";
import { createMealParser, MealParserUnavailable } from "../src/ai/meal-parser";
import { MEAL_PHOTO_SYSTEM, MEAL_TEXT_SYSTEM } from "../src/ai/prompts";

const USER_TEXT = "午餐 秘密牛肉麵";

const GOOD_JSON = JSON.stringify({
  is_food: true,
  items: [
    {
      name: "秘密牛肉麵",
      grams: 500,
      kcal: 650,
      protein_g: 30,
      carb_g: 80,
      fat_g: 20,
      confidence: 0.7,
    },
  ],
});

function message(
  content: unknown[],
  overrides: { stop_reason?: string; usage?: Record<string, unknown> } = {},
) {
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
      ...overrides.usage,
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
  return { parser: createMealParser(client, log), calls, logs };
}

describe("meal parser", () => {
  it("sends the expected request", async () => {
    const { parser, calls } = setup(() =>
      message([{ type: "text", text: GOOD_JSON }]),
    );
    await parser.parseText(USER_TEXT);
    const req = calls[0] as unknown as {
      model: string;
      max_tokens: number;
      output_config: { effort: string; format: { type: string } };
      system: { text: string; cache_control: unknown }[];
      messages: unknown;
    };
    expect(req.model).toBe("claude-haiku-5-5");
    expect(req.max_tokens).toBe(MEAL_TEXT_MAX_TOKENS);
    expect(req.output_config.effort).toBe("low");
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req.system[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(req.system[0]!.text).toBe(MEAL_TEXT_SYSTEM);
    expect(req.messages).toEqual([{ role: "user", content: USER_TEXT }]);
    expect("temperature" in req).toBe(false);
    expect("top_p" in req).toBe(false);
    expect("top_k" in req).toBe(false);
  });

  it("parses items after a thinking block and maps field names", async () => {
    const { parser } = setup(() =>
      message([
        { type: "thinking", thinking: "hmm", signature: "sig" },
        { type: "text", text: GOOD_JSON },
      ]),
    );
    const r = await parser.parseText(USER_TEXT);
    expect(r).toEqual({
      kind: "items",
      items: [
        {
          name: "秘密牛肉麵",
          grams: 500,
          kcal: 650,
          proteinG: 30,
          carbG: 80,
          fatG: 20,
          confidence: 0.7,
        },
      ],
      usage: { input: 100, output: 50, cacheRead: 80, cacheCreation: 0 },
    });
  });

  it("returns not_food for is_food false or empty items", async () => {
    for (const body of [
      { is_food: false, items: [] },
      { is_food: true, items: [] },
    ]) {
      const { parser } = setup(() =>
        message([{ type: "text", text: JSON.stringify(body) }]),
      );
      expect((await parser.parseText("今天好累")).kind).toBe("not_food");
    }
  });

  it("returns refused on refusal stop reason", async () => {
    const { parser } = setup(() => message([], { stop_reason: "refusal" }));
    expect((await parser.parseText(USER_TEXT)).kind).toBe("refused");
  });

  it("returns not_food on max_tokens", async () => {
    const { parser } = setup(() =>
      message([{ type: "text", text: GOOD_JSON }], {
        stop_reason: "max_tokens",
      }),
    );
    expect((await parser.parseText(USER_TEXT)).kind).toBe("not_food");
  });

  it("returns not_food for non-JSON, wrong shape or missing text", async () => {
    for (const content of [
      [{ type: "text", text: "not json" }],
      [
        {
          type: "text",
          text: JSON.stringify({ is_food: true, items: [{ name: "x" }] }),
        },
      ],
      [{ type: "thinking", thinking: "only", signature: "s" }],
    ]) {
      const { parser } = setup(() => message(content));
      expect((await parser.parseText(USER_TEXT)).kind).toBe("not_food");
    }
  });

  it("throws MealParserUnavailable on connection, 429 and 5xx errors", async () => {
    const errors = [
      new Anthropic.APIConnectionError({ message: "down" }),
      new Anthropic.APIConnectionTimeoutError(),
      new Anthropic.RateLimitError(429, {}, "slow down", new Headers()),
      new Anthropic.InternalServerError(500, {}, "boom", new Headers()),
    ];
    for (const err of errors) {
      const { parser } = setup(() => {
        throw err;
      });
      await expect(parser.parseText(USER_TEXT)).rejects.toBeInstanceOf(
        MealParserUnavailable,
      );
    }
  });

  it("treats other API errors as unavailable and logs only the status at error level", async () => {
    const calls: [string, unknown][] = [];
    const client = {
      messages: {
        create: async () => {
          throw new Anthropic.AuthenticationError(
            401,
            { secret: "k" },
            "bad key",
            new Headers(),
          );
        },
      },
    } as unknown as Anthropic;
    const log = {
      info: () => {},
      warn: () => {},
      error: (obj: unknown) => void calls.push(["error", obj]),
    } as unknown as FastifyBaseLogger;
    await expect(
      createMealParser(client, log).parseText(USER_TEXT),
    ).rejects.toBeInstanceOf(MealParserUnavailable);
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]).toMatchObject({ status: 401 });
    expect(JSON.stringify(calls)).not.toContain("bad key");
  });

  it("rethrows non-API errors unchanged", async () => {
    const boom = new TypeError("bug");
    const { parser } = setup(() => {
      throw boom;
    });
    await expect(parser.parseText(USER_TEXT)).rejects.toBe(boom);
  });

  it("logs token counts but never user text or item names", async () => {
    const { parser, logs } = setup(() =>
      message([{ type: "text", text: GOOD_JSON }]),
    );
    await parser.parseText(USER_TEXT);
    const out = JSON.stringify(logs);
    expect(out).not.toContain("秘密");
    expect(out).not.toContain("牛肉麵");
    expect(logs).toHaveLength(1);
    expect((logs[0] as unknown[])[0]).toMatchObject({
      event: "ai_call",
      kind: "text",
      stopReason: "end_turn",
      inputTokens: 100,
      outputTokens: 50,
      cacheRead: 80,
      cacheCreation: 0,
    });
  });
});

describe("meal parser photo", () => {
  const JPEG = Buffer.from("fake-jpeg-bytes-for-photo-test-0123456789");
  const B64 = JPEG.toString("base64");

  it("sends the expected image request", async () => {
    const { parser, calls } = setup(() =>
      message([{ type: "text", text: GOOD_JSON }]),
    );
    await parser.parsePhoto(JPEG);
    const req = calls[0] as unknown as {
      model: string;
      max_tokens: number;
      output_config: { effort: string; format: { type: string } };
      system: { text: string; cache_control: unknown }[];
      messages: unknown;
    };
    expect(req.model).toBe("claude-haiku-5-5");
    expect(req.max_tokens).toBe(MEAL_PHOTO_MAX_TOKENS);
    expect(req.output_config.effort).toBe("low");
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req.system[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(req.system[0]!.text).toBe(MEAL_PHOTO_SYSTEM);
    expect(req.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: B64 },
          },
          { type: "text", text: "這是我這一餐。" },
        ],
      },
    ]);
    expect("temperature" in req).toBe(false);
    expect("top_p" in req).toBe(false);
    expect("top_k" in req).toBe(false);
  });

  it("parses items", async () => {
    const { parser } = setup(() =>
      message([{ type: "text", text: GOOD_JSON }]),
    );
    const r = await parser.parsePhoto(JPEG);
    expect(r.kind).toBe("items");
    if (r.kind === "items") expect(r.items[0]!.name).toBe("秘密牛肉麵");
  });

  it("returns refused on refusal stop reason", async () => {
    const { parser } = setup(() => message([], { stop_reason: "refusal" }));
    expect((await parser.parsePhoto(JPEG)).kind).toBe("refused");
  });

  it("returns not_food on max_tokens, non-JSON and is_food false", async () => {
    const cases = [
      message([{ type: "text", text: GOOD_JSON }], {
        stop_reason: "max_tokens",
      }),
      message([{ type: "text", text: "not json" }]),
      message([
        { type: "text", text: JSON.stringify({ is_food: false, items: [] }) },
      ]),
    ];
    for (const c of cases) {
      const { parser } = setup(() => c);
      expect((await parser.parsePhoto(JPEG)).kind).toBe("not_food");
    }
  });

  it("throws MealParserUnavailable on connection errors", async () => {
    const { parser } = setup(() => {
      throw new Anthropic.APIConnectionError({ message: "down" });
    });
    await expect(parser.parsePhoto(JPEG)).rejects.toBeInstanceOf(
      MealParserUnavailable,
    );
  });

  it("logs kind photo and imageBytes but never image data or item names", async () => {
    const { parser, logs } = setup(() =>
      message([{ type: "text", text: GOOD_JSON }]),
    );
    await parser.parsePhoto(JPEG);
    const out = JSON.stringify(logs);
    expect(out).not.toContain(B64.slice(0, 20));
    expect(out).not.toContain("牛肉麵");
    expect(logs).toHaveLength(1);
    expect((logs[0] as unknown[])[0]).toMatchObject({
      event: "ai_call",
      kind: "photo",
      imageBytes: JPEG.length,
      stopReason: "end_turn",
      inputTokens: 100,
    });
  });
});

describe("MEAL_PHOTO_SYSTEM", () => {
  it("is static: no dates or times", () => {
    expect(MEAL_PHOTO_SYSTEM).not.toContain(String(new Date().getFullYear()));
    expect(MEAL_PHOTO_SYSTEM).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}/);
  });
});

describe("MEAL_TEXT_SYSTEM", () => {
  it("is static: no dates or times", async () => {
    const again = await import("../src/ai/prompts");
    expect(again.MEAL_TEXT_SYSTEM).toBe(MEAL_TEXT_SYSTEM);
    expect(MEAL_TEXT_SYSTEM).not.toContain(String(new Date().getFullYear()));
    expect(MEAL_TEXT_SYSTEM).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}/);
  });
});
