import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createProgram,
  saveProgramDay,
  type StoredProgramDay,
} from "../src/ask/programs";
import { deleteTemplate, listTemplates } from "../src/workouts/repo";
import { exercises } from "../src/db/schema";
import { syncUser, type Db } from "../src/users/repo";
import { createTestDb } from "./db";

const NOW = new Date("2026-10-22T04:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("ai programs", () => {
  let db: Db;
  let close: () => Promise<void>;
  let userA: string;
  let userB: string;
  let days: StoredProgramDay[];

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    userA = (await syncUser(db, "Ua", "A")).userId;
    userB = (await syncUser(db, "Ub", "B")).userId;
    const all = await db.select().from(exercises);
    const id = (slug: string) => {
      const e = all.find((x) => x.slug === slug);
      if (!e) throw new Error(`missing ${slug}`);
      return e.id;
    };
    days = [
      {
        name: "推日",
        items: [
          { exerciseId: id("barbell-bench-press"), sets: 4, reps: 8 },
          { exerciseId: id("close-grip-bench-press"), sets: 3, reps: 10 },
        ],
      },
      {
        name: "拉日",
        items: [{ exerciseId: id("barbell-row"), sets: 3, reps: 12 }],
      },
    ];
  });
  afterEach(() => close());

  it("saves a day as a template matching the program", async () => {
    const pid = await createProgram(db, userA, days, NOW);
    expect(await saveProgramDay(db, userA, pid, 1, NOW)).toEqual({
      outcome: "saved",
      templateName: "推日",
    });
    const [tpl, ...rest] = await listTemplates(db, userA);
    expect(rest).toEqual([]);
    expect(tpl?.name).toBe("推日");
    expect(
      tpl?.items.map((i) => [i.exercise.id, i.targetSets, i.targetReps]),
    ).toEqual(days[0]!.items.map((i) => [i.exerciseId, i.sets, i.reps]));
  });

  it("saving the same day again is already_saved", async () => {
    const pid = await createProgram(db, userA, days, NOW);
    await saveProgramDay(db, userA, pid, 1, NOW);
    expect(await saveProgramDay(db, userA, pid, 1, NOW)).toEqual({
      outcome: "already_saved",
      templateName: "推日",
    });
    expect(await listTemplates(db, userA)).toHaveLength(1);
  });

  it("concurrent saves create one template", async () => {
    const pid = await createProgram(db, userA, days, NOW);
    const results = await Promise.all([
      saveProgramDay(db, userA, pid, 1, NOW),
      saveProgramDay(db, userA, pid, 1, NOW),
    ]);
    expect(results.map((r) => r?.outcome).sort()).toEqual([
      "already_saved",
      "saved",
    ]);
    expect(await listTemplates(db, userA)).toHaveLength(1);
  });

  it("can save again after the template was deleted", async () => {
    const pid = await createProgram(db, userA, days, NOW);
    await saveProgramDay(db, userA, pid, 1, NOW);
    const [tpl] = await listTemplates(db, userA);
    await deleteTemplate(db, userA, tpl!.id);
    expect((await saveProgramDay(db, userA, pid, 1, NOW))?.outcome).toBe(
      "saved",
    );
    expect(await listTemplates(db, userA)).toHaveLength(1);
  });

  it("keeps days and programs independent", async () => {
    const p1 = await createProgram(db, userA, days, NOW);
    const p2 = await createProgram(db, userA, days, NOW);
    expect((await saveProgramDay(db, userA, p1, 1, NOW))?.outcome).toBe(
      "saved",
    );
    expect((await saveProgramDay(db, userA, p1, 2, NOW))?.outcome).toBe(
      "saved",
    );
    expect((await saveProgramDay(db, userA, p2, 1, NOW))?.outcome).toBe(
      "saved",
    );
    expect(await listTemplates(db, userA)).toHaveLength(3);
  });

  it("returns null for bad day, other user's or unknown program", async () => {
    const pid = await createProgram(db, userA, days, NOW);
    expect(await saveProgramDay(db, userA, pid, 0, NOW)).toBeNull();
    expect(await saveProgramDay(db, userA, pid, 3, NOW)).toBeNull();
    expect(await saveProgramDay(db, userB, pid, 1, NOW)).toBeNull();
    expect(await saveProgramDay(db, userA, randomUUID(), 1, NOW)).toBeNull();
    expect(await listTemplates(db, userA)).toEqual([]);
    expect(await listTemplates(db, userB)).toEqual([]);
  });

  it("expires after 90 days", async () => {
    const old = await createProgram(db, userA, days, daysAgo(91));
    const fresh = await createProgram(db, userA, days, daysAgo(89));
    expect(await saveProgramDay(db, userA, old, 1, NOW)).toBeNull();
    expect((await saveProgramDay(db, userA, fresh, 1, NOW))?.outcome).toBe(
      "saved",
    );
  });
});
