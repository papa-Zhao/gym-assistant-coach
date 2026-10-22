import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  MealParserUnavailable,
  type MealParser,
  type ParseResult,
  type ParsedItem,
} from "../src/ai/meal-parser";
import { aiUsageDaily, mealItems, meals } from "../src/db/schema";
import { logMealFromText, sanitizeItems } from "../src/meals/text";
import { syncUser } from "../src/users/repo";
import { createTestDb } from "./db";

const USAGE = { input: 10, output: 5, cacheRead: 2, cacheCreation: 1 };
const item = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  name: "雞腿便當",
  grams: 450,
  kcal: 800,
  proteinG: 35,
  carbG: 90,
  fatG: 30,
  confidence: 0.7,
  ...over,
});

describe("sanitizeItems", () => {
  it("clamps grams and rounds to 0.1", () => {
    const out = sanitizeItems([
      item({ grams: 0 }),
      item({ grams: 5000 }),
      item({ grams: 150.55 }),
    ]);
    expect(out.map((i) => i.grams)).toEqual([1, 2000, 150.6]);
  });

  it("drops negative or non-finite nutrition and blank names", () => {
    const out = sanitizeItems([
      item({ kcal: -10 }),
      item({ kcal: NaN }),
      item({ proteinG: Infinity }),
      item({ fatG: -0.1 }),
      item({ grams: NaN }),
      item({ name: "   " }),
      item({ name: "ok" }),
    ]);
    expect(out.map((i) => i.name)).toEqual(["ok"]);
  });

  it("drops values too large to store", () => {
    expect(sanitizeItems([item({ carbG: 100000 })])).toEqual([]);
  });

  it("rounds nutrition, trims and truncates names, clamps confidence", () => {
    const [a, b] = sanitizeItems([
      item({
        name: `  ${"飯".repeat(40)} `,
        kcal: 800.6,
        proteinG: 35.04,
        carbG: 90.06,
        fatG: 30.25,
        confidence: 1.5,
      }),
      item({ confidence: 0.456 }),
    ]);
    expect(a?.name).toBe("飯".repeat(30));
    expect([a?.kcal, a?.proteinG, a?.carbG, a?.fatG]).toEqual([
      801, 35, 90.1, 30.3,
    ]);
    expect(a?.aiConfidence).toBe(1);
    expect(b?.aiConfidence).toBe(0.46);
  });

  it("drops trailing whitespace left by truncation", () => {
    const [a] = sanitizeItems([item({ name: `${"飯".repeat(29)} 湯` })]);
    expect(a?.name).toBe("飯".repeat(29));
  });

  it("keeps at most 30 items", () => {
    expect(
      sanitizeItems(Array.from({ length: 40 }, () => item())),
    ).toHaveLength(30);
  });
});

describe("logMealFromText", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function setup(result: () => Promise<ParseResult>) {
    const t = await createTestDb();
    close = t.close;
    const { userId } = await syncUser(t.db, "U1", "Amy");
    let calls = 0;
    const parser: MealParser = {
      parseText: async () => {
        calls += 1;
        return result();
      },
    };
    let clock = new Date("2026-10-22T04:00:00Z");
    const run = (text = "午餐 雞腿便當") =>
      logMealFromText(
        { db: t.db, parser, now: () => clock },
        userId,
        "lunch",
        text,
      );
    const used = async () =>
      (
        await t.db
          .select()
          .from(aiUsageDaily)
          .where(eq(aiUsageDaily.userId, userId))
      )[0];
    return {
      ...t,
      userId,
      run,
      used,
      calls: () => calls,
      setClock: (d: Date) => (clock = d),
    };
  }

  const ok = async (): Promise<ParseResult> => ({
    kind: "items",
    items: [item()],
    usage: USAGE,
  });

  it("creates a text draft without food link", async () => {
    const s = await setup(ok);
    const out = await s.run();
    expect(out.kind).toBe("draft");
    if (out.kind !== "draft") return;
    expect(out.meal).toMatchObject({
      status: "draft",
      source: "text",
      mealType: "lunch",
      eatenOn: "2026-10-22",
    });
    expect(out.meal.items[0]).toMatchObject({
      foodId: null,
      aiConfidence: 0.7,
      name: "雞腿便當",
    });
    const [row] = await s.db.select().from(mealItems);
    expect(row?.foodId).toBeNull();
    expect(Number(row?.aiConfidence)).toBe(0.7);
    expect(await s.used()).toMatchObject({
      count: 1,
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 2,
      cacheCreationTokens: 1,
    });
  });

  it("uses the Taipei date", async () => {
    const s = await setup(ok);
    s.setClock(new Date("2026-10-22T16:00:00Z"));
    const out = await s.run();
    expect(out.kind === "draft" && out.meal.eatenOn).toBe("2026-10-23");
  });

  it("refuses the 21st call without calling the parser", async () => {
    const s = await setup(ok);
    for (let i = 0; i < 20; i++) expect((await s.run()).kind).toBe("draft");
    expect((await s.run()).kind).toBe("limit");
    expect(s.calls()).toBe(20);
  });

  it("gives the use back when the parser is unavailable", async () => {
    let fail = true;
    const s = await setup(async () => {
      if (fail) throw new MealParserUnavailable("down");
      return ok();
    });
    for (let i = 0; i < 25; i++) {
      expect((await s.run()).kind).toBe("unavailable");
    }
    fail = false;
    for (let i = 0; i < 20; i++) expect((await s.run()).kind).toBe("draft");
    expect((await s.run()).kind).toBe("limit");
  });

  it("rethrows unexpected parser errors", async () => {
    const s = await setup(async () => {
      throw new Error("boom");
    });
    await expect(s.run()).rejects.toThrow("boom");
  });

  it.each(["refused", "not_food"] as const)(
    "%s creates no meal but still counts",
    async (kind) => {
      const s = await setup(async () => ({ kind, usage: USAGE }));
      expect((await s.run()).kind).toBe(kind);
      expect(await s.db.select().from(meals)).toHaveLength(0);
      expect(await s.used()).toMatchObject({ count: 1, inputTokens: 10 });
    },
  );

  it("returns not_food when every item is dropped", async () => {
    const s = await setup(async () => ({
      kind: "items",
      items: [item({ kcal: -1 }), item({ name: "" })],
      usage: USAGE,
    }));
    expect((await s.run()).kind).toBe("not_food");
    expect(await s.db.select().from(meals)).toHaveLength(0);
  });
});
