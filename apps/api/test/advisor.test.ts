import Anthropic from "@anthropic-ai/sdk";
import type { Exercise } from "@gac/shared";
import type { FastifyBaseLogger } from "fastify";
import { describe, expect, it } from "vitest";
import { AiUnavailable } from "../src/ai/structured-call";
import { askSchema, askSystemPrompt, createAdvisor } from "../src/ai/advisor";
import { ASK_MAX_TOKENS } from "../src/ai/config";
import { ASK_SYSTEM_HEAD } from "../src/ai/prompts";
import { adviceText, shapeAdvice } from "../src/ask/advice";
import { MEDICAL_NOTICE } from "../src/ask/safety";

const GOOD = {
  title: "吃便當",
  items: [{ name: "雞腿", detail: "560 kcal" }],
  body: "ok",
  program: [],
};

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
    kind: "strength",
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
];
const OTHER_LIBRARY: Exercise[] = [LIBRARY[0]!];

const PROGRAM = [
  {
    name: "推日",
    exercises: [{ slug: "barbell-bench-press", sets: 4, reps: 8 }],
  },
];

function message(content: unknown[], stop_reason = "end_turn") {
  return {
    id: "m",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content,
    stop_reason,
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: null,
    },
  };
}

function setup(result: () => unknown) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    messages: {
      create: async (params: Record<string, unknown>) => {
        calls.push(params);
        return result();
      },
    },
  } as unknown as Anthropic;
  const noop = () => undefined;
  const log = {
    info: noop,
    warn: noop,
    error: noop,
  } as unknown as FastifyBaseLogger;
  return { advisor: createAdvisor(client, log), calls };
}

const input = {
  context: "CTX",
  history: [
    { role: "user" as const, content: "q1" },
    { role: "assistant" as const, content: "a1" },
  ],
  question: "吃什麼",
  library: LIBRARY,
};

describe("advisor", () => {
  it("sends the expected request", async () => {
    const { advisor, calls } = setup(() =>
      message([{ type: "text", text: JSON.stringify(GOOD) }]),
    );
    await advisor.ask(input);
    const req = calls[0] as unknown as {
      max_tokens: number;
      output_config: { effort: string; format: { schema: unknown } };
      system: { text: string; cache_control: unknown }[];
      messages: unknown;
    };
    expect(req.max_tokens).toBe(ASK_MAX_TOKENS);
    expect(req.output_config.effort).toBe("medium");
    expect(req.output_config.format.schema).toBe(askSchema(LIBRARY));
    expect(req.system[0]!.text).toBe(askSystemPrompt(LIBRARY));
    expect(req.system[0]!.text.startsWith(ASK_SYSTEM_HEAD)).toBe(true);
    expect(req.system[0]!.text).toContain("barbell-bench-press｜槓鈴臥推｜");
    expect(req.system[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(req.messages).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "CTX\n\n使用者問題：吃什麼" },
    ]);
    expect("temperature" in req).toBe(false);
  });

  it("returns ok for valid JSON", async () => {
    const { advisor } = setup(() =>
      message([{ type: "text", text: JSON.stringify(GOOD) }]),
    );
    const r = await advisor.ask(input);
    expect(r).toEqual({
      kind: "ok",
      advice: GOOD,
      usage: { input: 10, output: 5, cacheRead: 0, cacheCreation: 0 },
    });
  });

  it("parses a program", async () => {
    const { advisor } = setup(() =>
      message([
        { type: "text", text: JSON.stringify({ ...GOOD, program: PROGRAM }) },
      ]),
    );
    const r = await advisor.ask(input);
    expect(r.kind === "ok" && r.advice.program).toEqual(PROGRAM);
  });

  it("rejects a malformed program", async () => {
    const bads: unknown[] = [
      undefined,
      [
        {
          name: "推日",
          exercises: [{ slug: "a", sets: "4", reps: 8 }],
        },
      ],
      [{ name: "推日", exercises: "x" }],
      [{ name: 1, exercises: [] }],
      [{ name: "推日", exercises: [{ slug: 1, sets: 4, reps: 8 }] }],
    ];
    for (const program of bads) {
      const { advisor } = setup(() =>
        message([{ type: "text", text: JSON.stringify({ ...GOOD, program }) }]),
      );
      expect((await advisor.ask(input)).kind).toBe("invalid");
    }
  });

  it("maps refusal, max_tokens and bad shape", async () => {
    const refused = setup(() => message([], "refusal"));
    expect((await refused.advisor.ask(input)).kind).toBe("refused");
    const max = setup(() =>
      message([{ type: "text", text: "{}" }], "max_tokens"),
    );
    expect((await max.advisor.ask(input)).kind).toBe("invalid");
    const bad = setup(() =>
      message([
        {
          type: "text",
          text: JSON.stringify({ title: 1, items: [], body: "" }),
        },
      ]),
    );
    expect((await bad.advisor.ask(input)).kind).toBe("invalid");
    const badItem = setup(() =>
      message([
        {
          type: "text",
          text: JSON.stringify({ ...GOOD, items: [{ name: "x" }] }),
        },
      ]),
    );
    expect((await badItem.advisor.ask(input)).kind).toBe("invalid");
  });

  it("throws AiUnavailable on API errors", async () => {
    const { advisor } = setup(() => {
      throw new Anthropic.InternalServerError(
        500,
        undefined,
        "boom",
        new Headers(),
      );
    });
    await expect(advisor.ask(input)).rejects.toBeInstanceOf(AiUnavailable);
  });
});

describe("ask prompt and schema", () => {
  it("are stable for the same library and change with another", () => {
    expect(askSystemPrompt(LIBRARY)).toBe(askSystemPrompt([...LIBRARY]));
    expect(askSchema(LIBRARY)).toBe(askSchema([...LIBRARY]));
    expect(askSystemPrompt(OTHER_LIBRARY)).not.toBe(askSystemPrompt(LIBRARY));
    expect(askSchema(OTHER_LIBRARY)).not.toBe(askSchema(LIBRARY));
  });

  it("limits program slugs to the library", () => {
    const schema = askSchema(LIBRARY) as {
      required: string[];
      properties: {
        program: {
          items: {
            properties: {
              exercises: {
                items: { properties: { slug: { enum: string[] } } };
              };
            };
          };
        };
      };
    };
    expect(schema.required).toEqual(["title", "items", "body", "program"]);
    expect(
      schema.properties.program.items.properties.exercises.items.properties.slug
        .enum,
    ).toEqual(["barbell-bench-press", "lat-pulldown"]);
  });
});

describe("shapeAdvice", () => {
  const opts = { question: "吃什麼", floorKcal: 1500, todayLine: "今天剩 500" };

  it("truncates and fills defaults", () => {
    const long = shapeAdvice({ ...GOOD, title: "字".repeat(40) }, opts);
    expect(Array.from(long.title)).toHaveLength(30);
    expect(shapeAdvice({ ...GOOD, title: "  " }, opts).title).toBe("AI 建議");
    expect(shapeAdvice({ ...GOOD, body: "😀".repeat(900) }, opts).body).toBe(
      "😀".repeat(800),
    );
  });

  it("keeps at most 3 non-blank items", () => {
    const items = [
      { name: " ", detail: "x" },
      ...["a", "b", "c", "d", "e"].map((name) => ({ name, detail: "d" })),
    ];
    const a = shapeAdvice({ ...GOOD, items }, opts);
    expect(a.items.map((i) => i.name)).toEqual(["a", "b", "c"]);
  });

  it("adds notices, medical first", () => {
    const a = shapeAdvice(
      { ...GOOD, body: "每天 1000 kcal" },
      { ...opts, question: "我懷孕了" },
    );
    expect(a.notices).toEqual([
      MEDICAL_NOTICE,
      "提醒：每天熱量建議不低於 1500 kcal。",
    ]);
    expect(shapeAdvice(GOOD, opts).notices).toEqual([]);
    const split = shapeAdvice(
      {
        title: "每天都吃",
        items: [{ name: "雞腿", detail: "560 kcal" }],
        program: [],
        body: "ok",
      },
      opts,
    );
    expect(split.notices).toEqual([]);
    expect(shapeAdvice(GOOD, opts).todayLine).toBe("今天剩 500");
  });
});

describe("adviceText", () => {
  it("joins title, items and body", () => {
    const a = shapeAdvice(GOOD, {
      question: "q",
      floorKcal: 1500,
      todayLine: null,
    });
    expect(adviceText(a)).toBe("吃便當\n・雞腿（560 kcal）\nok");
    const blank = shapeAdvice(
      { ...GOOD, items: [{ name: "雞腿", detail: " " }] },
      { question: "q", floorKcal: 1500, todayLine: null },
    );
    expect(adviceText(blank)).toBe("吃便當\n・雞腿\nok");
  });
});
