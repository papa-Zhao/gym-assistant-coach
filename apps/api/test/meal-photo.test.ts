import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import {
  MealParserUnavailable,
  type MealParser,
  type ParseResult,
} from "../src/ai/meal-parser";
import { aiUsageDaily, meals } from "../src/db/schema";
import { logMealFromPhoto } from "../src/meals/photo";
import { mealPhotoKey } from "../src/meals/repo";
import { syncUser } from "../src/users/repo";
import { createTestDb, memoryPhotoStore } from "./db";

const USAGE = { input: 10, output: 5, cacheRead: 2, cacheCreation: 1 };
const food = async (): Promise<ParseResult> => ({
  kind: "items",
  items: [
    {
      name: "雞腿便當",
      grams: 450,
      kcal: 800,
      proteinG: 35,
      carbG: 90,
      fatG: 30,
      confidence: 0.7,
    },
  ],
  usage: USAGE,
});

const testJpeg = () =>
  sharp({
    create: {
      width: 40,
      height: 30,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
    .jpeg()
    .toBuffer();

describe("logMealFromPhoto", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function setup(result: () => Promise<ParseResult> = food) {
    const t = await createTestDb();
    close = t.close;
    const { userId } = await syncUser(t.db, "U1", "Amy");
    let calls = 0;
    const parser: MealParser = {
      parseText: async () => {
        throw new Error("unused");
      },
      parsePhoto: async () => {
        calls += 1;
        return result();
      },
    };
    const photos = memoryPhotoStore();
    const warns: unknown[][] = [];
    const log = { warn: (...a: unknown[]) => warns.push(a) } as never;
    let clock = new Date("2026-10-22T04:30:00Z");
    const image = await testJpeg();
    const run = (img: Buffer = image) =>
      logMealFromPhoto(
        { db: t.db, parser, photos: photos.store, now: () => clock, log },
        userId,
        img,
      );
    const usage = () =>
      t.db
        .select()
        .from(aiUsageDaily)
        .where(
          and(eq(aiUsageDaily.userId, userId), eq(aiUsageDaily.kind, "photo")),
        );
    return {
      ...t,
      userId,
      run,
      usage,
      photos,
      warns,
      calls: () => calls,
      setClock: (d: Date) => (clock = d),
    };
  }

  it("creates a photo draft and stores the photo", async () => {
    const s = await setup();
    const out = await s.run();
    if (out.kind !== "draft") throw new Error(out.kind);
    expect(out.meal).toMatchObject({
      status: "draft",
      source: "photo",
      mealType: "lunch",
    });
    expect(out.meal.items[0]?.foodId).toBeNull();
    expect(s.photos.calls.put).toHaveLength(1);
    const key = s.photos.calls.put[0] as string;
    expect(key).toMatch(new RegExp(`^meals/${s.userId}/[0-9a-f-]+\\.jpg$`));
    expect(await mealPhotoKey(s.db, s.userId, out.meal.id)).toBe(key);
  });

  it.each([
    ["2026-10-22T04:30:00Z", "lunch"],
    ["2026-10-22T11:00:00Z", "dinner"],
  ])("picks the meal type from Taipei time at %s", async (iso, type) => {
    const s = await setup();
    s.setClock(new Date(iso));
    const out = await s.run();
    expect(out.kind === "draft" && out.meal.mealType).toBe(type);
  });

  it("rejects an unreadable image without calling the parser or counting", async () => {
    const s = await setup();
    expect((await s.run(Buffer.from("not an image"))).kind).toBe(
      "invalid_image",
    );
    expect(s.calls()).toBe(0);
    expect(await s.usage()).toHaveLength(0);
  });

  it("stops at the daily limit", async () => {
    const s = await setup();
    for (let i = 0; i < 10; i++) expect((await s.run()).kind).toBe("draft");
    expect((await s.run()).kind).toBe("limit");
    expect(s.calls()).toBe(10);
  });

  it("gives the use back when the parser is unavailable", async () => {
    const s = await setup(async () => {
      throw new MealParserUnavailable("down");
    });
    expect((await s.run()).kind).toBe("unavailable");
    expect(await s.usage()).toMatchObject([{ count: 0 }]);
    expect(s.photos.calls.put).toHaveLength(0);
  });

  it.each(["refused", "not_food"] as const)(
    "%s stores nothing but still counts",
    async (kind) => {
      const s = await setup(async () => ({ kind, usage: USAGE }));
      expect((await s.run()).kind).toBe(kind);
      expect(await s.db.select().from(meals)).toHaveLength(0);
      expect(s.photos.calls.put).toHaveLength(0);
      expect(await s.usage()).toMatchObject([{ count: 1, inputTokens: 10 }]);
    },
  );

  it("returns the draft without a photo when the upload fails", async () => {
    const s = await setup();
    s.photos.fail.put = true;
    const out = await s.run();
    if (out.kind !== "draft") throw new Error(out.kind);
    expect(await mealPhotoKey(s.db, s.userId, out.meal.id)).toBeNull();
    expect(s.warns).toHaveLength(1);
    const logged = JSON.stringify(s.warns);
    expect(logged).not.toContain("meals/");
    expect(logged).not.toContain("boom");
    expect(logged).not.toContain(s.userId);
  });
});
