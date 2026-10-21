import {
  EQUIPMENT_CATEGORIES,
  MUSCLE_GROUPS,
  type Exercise,
} from "@gac/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  WorkoutError,
  addItem,
  archiveCustomExercise,
  createCustomExercise,
  createTemplateFromSession,
  deleteSet,
  deleteTemplate,
  finishSession,
  getActiveSession,
  getSessionById,
  listExercises,
  listTemplates,
  startSession,
  todayWorkoutSummary,
  upsertCardio,
  upsertSet,
  weekStats,
} from "../src/workouts/repo";
import { exercises } from "../src/db/schema";
import { syncUser } from "../src/users/repo";
import { createTestDb } from "./db";

describe("workouts repo", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function setup() {
    const t = await createTestDb();
    close = t.close;
    const { userId } = await syncUser(t.db, "U1", "Amy");
    const { userId: otherId } = await syncUser(t.db, "U2", "Bob");
    const all = await listExercises(t.db, userId);
    const slug = (s: string): Exercise => {
      const e = all.find((x) => x.slug === s);
      if (!e) throw new Error(`missing seed ${s}`);
      return e;
    };
    return { db: t.db, statements: t.statements, userId, otherId, slug };
  }

  /** Runs one finished session with the given sets for one exercise. */
  async function doSession(
    db: Awaited<ReturnType<typeof setup>>["db"],
    userId: string,
    date: string,
    exerciseId: string,
    sets: [number, number][],
  ) {
    const s = await startSession(db, userId, date);
    for (const [i, [w, r]] of sets.entries()) {
      await upsertSet(db, userId, s.id, exerciseId, {
        setIndex: i + 1,
        weightKg: w,
        reps: r,
      });
    }
    return { id: s.id, summary: await finishSession(db, userId, s.id) };
  }

  it("seed has at least 3 exercises per muscle group and unique names", async () => {
    const { db, userId } = await setup();
    const all = await listExercises(db, userId);
    const strength = all.filter((e) => e.kind === "strength");
    for (const m of MUSCLE_GROUPS) {
      expect(
        strength.filter((e) => e.muscleGroup === m).length,
      ).toBeGreaterThanOrEqual(3);
    }
    expect(strength.length).toBeGreaterThanOrEqual(40);
    const names = all.map((e) => e.nameZh);
    expect(new Set(names).size).toBe(names.length);
    const slugs = all.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("seed covers all equipment categories and has 8+ cardio exercises, all with slug and English name", async () => {
    const { db, userId } = await setup();
    const all = await listExercises(db, userId);
    const cats = new Set(all.map((e) => e.equipmentCategory));
    for (const c of EQUIPMENT_CATEGORIES) expect(cats.has(c)).toBe(true);
    for (const c of ["machine", "semi_machine", "free_weight", "bodyweight"]) {
      expect(
        all.filter((e) => e.kind === "strength" && e.equipmentCategory === c)
          .length,
      ).toBeGreaterThanOrEqual(4);
    }
    const cardio = all.filter((e) => e.kind === "cardio");
    expect(cardio.length).toBeGreaterThanOrEqual(8);
    expect(cardio.every((e) => e.muscleGroup === null)).toBe(true);
    for (const e of all) {
      expect(e.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(e.nameEn).toBeTruthy();
    }
  });

  it("search matches English name", async () => {
    const { db, userId } = await setup();
    const hits = await listExercises(db, userId, { q: "bench" });
    expect(hits.map((e) => e.nameZh)).toContain("槓鈴臥推");
    const zh = await listExercises(db, userId, { q: "臥推" });
    expect(zh.map((e) => e.slug)).toContain("barbell-bench-press");
    const back = await listExercises(db, userId, { muscle: "back" });
    expect(back.every((e) => e.muscleGroup === "back")).toBe(true);
  });

  it("record cardio entry and reopen", async () => {
    const { db, userId, slug } = await setup();
    const run = slug("treadmill-run");
    const s = await startSession(db, userId, "2026-10-19");
    await upsertCardio(db, userId, s.id, run.id, {
      entryIndex: 1,
      durationMin: 30,
      distanceKm: 4.5,
      inclinePct: 2,
      speedKmh: 9,
    });
    const active = await getActiveSession(db, userId, "2026-10-19");
    const item = active?.items[0];
    expect(item && "cardio" in item ? item.cardio : null).toEqual([
      {
        entryIndex: 1,
        durationMin: 30,
        distanceKm: 4.5,
        inclinePct: 2,
        speedKmh: 9,
      },
    ]);
    expect(item?.last).toBeNull();
    expect(item?.hint).toBeNull();
    await expect(
      upsertSet(db, userId, s.id, run.id, {
        setIndex: 1,
        weightKg: 1,
        reps: 1,
      }),
    ).rejects.toMatchObject({ code: "wrong_kind" });
    await expect(
      upsertCardio(db, userId, s.id, slug("pull-up").id, {
        entryIndex: 1,
        durationMin: 5,
      }),
    ).rejects.toBeInstanceOf(WorkoutError);
  });

  it("cardio is excluded from volume, PRs and muscle sets", async () => {
    const { db, userId, slug } = await setup();
    const s = await startSession(db, userId, "2026-10-19");
    await upsertCardio(db, userId, s.id, slug("treadmill-run").id, {
      entryIndex: 1,
      durationMin: 20,
    });
    await upsertSet(db, userId, s.id, slug("barbell-bench-press").id, {
      setIndex: 1,
      weightKg: 60,
      reps: 10,
    });
    const sum = await finishSession(db, userId, s.id);
    expect(sum.volumeKg).toBe(600);
    expect(sum.setCount).toBe(1);
    expect(sum.cardioMinutes).toBe(20);
    expect(sum.exerciseCount).toBe(2);
    expect(sum.prs).toEqual([]);
    const w = await weekStats(db, userId, "2026-10-19", "2026-10-25");
    expect(w.cardioMinutes).toBe(20);
    expect(Object.values(w.setsByMuscle).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("custom exercise visible only to owner", async () => {
    const { db, userId, otherId } = await setup();
    const mine = await createCustomExercise(db, userId, {
      nameZh: "我的動作",
      kind: "strength",
      muscleGroup: "chest",
      equipment: "dumbbell",
    });
    expect(mine).toMatchObject({ isCustom: true, slug: null, nameEn: null });
    expect((await listExercises(db, userId, { q: "我的" })).length).toBe(1);
    expect(await listExercises(db, otherId, { q: "我的" })).toEqual([]);
    await expect(
      archiveCustomExercise(db, otherId, mine.id),
    ).rejects.toMatchObject({
      code: "not_found",
    });
    const s = await startSession(db, otherId, "2026-10-19");
    await expect(addItem(db, otherId, s.id, mine.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("archiving a used custom exercise keeps history", async () => {
    const { db, userId } = await setup();
    const used = await createCustomExercise(db, userId, {
      nameZh: "用過的",
      kind: "strength",
      muscleGroup: "back",
      equipment: "cable",
    });
    const unused = await createCustomExercise(db, userId, {
      nameZh: "沒用過的",
      kind: "cardio",
      equipment: "none",
    });
    expect(unused.muscleGroup).toBeNull();
    await doSession(db, userId, "2026-10-19", used.id, [[40, 10]]);
    expect(await archiveCustomExercise(db, userId, used.id)).toBe("archived");
    expect(await archiveCustomExercise(db, userId, unused.id)).toBe("deleted");
    expect(await listExercises(db, userId, { q: "用過" })).toEqual([]);
    const rows = await db.select().from(exercises);
    expect(rows.find((r) => r.id === used.id)?.archivedAt).not.toBeNull();
    expect(rows.find((r) => r.id === unused.id)).toBeUndefined();
  });

  it("only one active session; starting again returns it", async () => {
    const { db, userId } = await setup();
    expect(await getActiveSession(db, userId, "2026-10-19")).toBeNull();
    const a = await startSession(db, userId, "2026-10-19");
    const b = await startSession(db, userId, "2026-10-20");
    expect(b.id).toBe(a.id);
    expect(b.date).toBe("2026-10-19");
    await finishSession(db, userId, a.id);
    const c = await startSession(db, userId, "2026-10-20");
    expect(c.id).not.toBe(a.id);
  });

  it("start from template creates items with targets", async () => {
    const { db, userId, slug } = await setup();
    const bench = slug("barbell-bench-press");
    const row = slug("barbell-row");
    const s = await startSession(db, userId, "2026-10-19");
    await addItem(db, userId, s.id, bench.id, { targetSets: 4, targetReps: 8 });
    await addItem(db, userId, s.id, row.id);
    await upsertSet(db, userId, s.id, row.id, {
      setIndex: 1,
      weightKg: 50,
      reps: 12,
    });
    await upsertCardio(db, userId, s.id, slug("outdoor-run").id, {
      entryIndex: 1,
      durationMin: 10,
    });
    const tpl = await createTemplateFromSession(db, userId, s.id, "推日");
    expect(
      tpl.items.map((i) => [i.exercise.slug, i.targetSets, i.targetReps]),
    ).toEqual([
      ["barbell-bench-press", 4, 8],
      ["barbell-row", 1, 12],
    ]);
    await finishSession(db, userId, s.id);

    const started = await startSession(db, userId, "2026-10-20", tpl.id);
    expect(started.templateId).toBe(tpl.id);
    expect(started.templateName).toBe("推日");
    expect(
      started.items.map((i) => [i.exercise.slug, i.targetSets, i.targetReps]),
    ).toEqual([
      ["barbell-bench-press", 4, 8],
      ["barbell-row", 1, 12],
    ]);
    expect((await listTemplates(db, userId)).length).toBe(1);
  });

  it("active session includes last sets and hint", async () => {
    const { db, userId, slug } = await setup();
    const bench = slug("barbell-bench-press");
    await doSession(db, userId, "2026-10-12", bench.id, [
      [60, 8],
      [60, 8],
    ]);
    const s = await startSession(db, userId, "2026-10-19");
    await addItem(db, userId, s.id, bench.id, { targetSets: 2, targetReps: 8 });
    const item = (await getActiveSession(db, userId, "2026-10-19"))?.items[0];
    expect(item?.last).toEqual({
      date: "2026-10-12",
      sets: [
        { setIndex: 1, weightKg: 60, reps: 8 },
        { setIndex: 2, weightKg: 60, reps: 8 },
      ],
    });
    expect(item?.hint).toEqual({ suggestWeightKg: 62.5 });
  });

  it("first time exercise has no last and no hint", async () => {
    const { db, userId, slug } = await setup();
    const s = await startSession(db, userId, "2026-10-19");
    await addItem(db, userId, s.id, slug("pull-up").id);
    const item = (await getActiveSession(db, userId, "2026-10-19"))?.items[0];
    expect(item?.last).toBeNull();
    expect(item?.hint).toBeNull();
  });

  it("upsert set overwrites same index", async () => {
    const { db, userId, slug } = await setup();
    const bench = slug("barbell-bench-press");
    const s = await startSession(db, userId, "2026-10-19");
    await upsertSet(db, userId, s.id, bench.id, {
      setIndex: 1,
      weightKg: 60,
      reps: 8,
    });
    await upsertSet(db, userId, s.id, bench.id, {
      setIndex: 1,
      weightKg: 62.5,
      reps: 6,
      rpe: 8.5,
    });
    await upsertSet(db, userId, s.id, bench.id, {
      setIndex: 2,
      weightKg: 50,
      reps: 10,
    });
    await deleteSet(db, userId, s.id, bench.id, 2);
    const item = (await getActiveSession(db, userId, "2026-10-19"))?.items[0];
    expect(item && "sets" in item ? item.sets : null).toEqual([
      { setIndex: 1, weightKg: 62.5, reps: 6, rpe: 8.5 },
    ]);
  });

  it("finish computes volume and PRs, first-time not PR, bodyweight ignored", async () => {
    const { db, userId, slug } = await setup();
    const bench = slug("barbell-bench-press");
    const first = await doSession(db, userId, "2026-10-12", bench.id, [
      [60, 10],
    ]);
    expect(first.summary.prs).toEqual([]);
    const s = await startSession(db, userId, "2026-10-19");
    await upsertSet(db, userId, s.id, bench.id, {
      setIndex: 1,
      weightKg: 60,
      reps: 10,
    });
    await upsertSet(db, userId, s.id, bench.id, {
      setIndex: 2,
      weightKg: 65,
      reps: 8,
    });
    await upsertSet(db, userId, s.id, slug("pull-up").id, {
      setIndex: 1,
      weightKg: 0,
      reps: 10,
    });
    const sum = await finishSession(db, userId, s.id);
    expect(sum.volumeKg).toBe(600 + 520);
    expect(sum.setCount).toBe(3);
    expect(sum.notified).toBe(false);
    expect(sum.prs).toEqual([
      {
        exerciseId: bench.id,
        nameZh: "槓鈴臥推",
        nameEn: "Barbell Bench Press",
        e1rm: 82.3,
        weightKg: 65,
        reps: 8,
      },
    ]);
    await expect(finishSession(db, userId, s.id)).rejects.toMatchObject({
      code: "already_finished",
    });
    // equal e1rm is not a PR
    const again = await doSession(db, userId, "2026-10-26", bench.id, [
      [65, 8],
    ]);
    expect(again.summary.prs).toEqual([]);
  });

  it("week stats counts completed sets by primary muscle within Mon–Sun", async () => {
    const { db, userId, slug } = await setup();
    const bench = slug("barbell-bench-press");
    const squat = slug("barbell-back-squat");
    const mon = await startSession(db, userId, "2026-10-19");
    await upsertSet(db, userId, mon.id, bench.id, {
      setIndex: 1,
      weightKg: 60,
      reps: 8,
    });
    await upsertSet(db, userId, mon.id, bench.id, {
      setIndex: 2,
      weightKg: 60,
      reps: 8,
    });
    await upsertSet(db, userId, mon.id, squat.id, {
      setIndex: 1,
      weightKg: 80,
      reps: 5,
    });
    await finishSession(db, userId, mon.id);
    await doSession(db, userId, "2026-10-25", bench.id, [[60, 8]]);
    await doSession(db, userId, "2026-10-18", bench.id, [[60, 8]]);
    await doSession(db, userId, "2026-10-26", bench.id, [[60, 8]]);
    const open = await startSession(db, userId, "2026-10-21");
    await upsertSet(db, userId, open.id, bench.id, {
      setIndex: 1,
      weightKg: 60,
      reps: 8,
    });
    const w = await weekStats(db, userId, "2026-10-19", "2026-10-25");
    expect(w.sessions).toBe(2);
    expect(w.setsByMuscle.chest).toBe(3);
    expect(w.setsByMuscle.quads).toBe(1);
    expect(w.setsByMuscle.back).toBe(0);
    const today = await todayWorkoutSummary(db, userId, "2026-10-19");
    expect(today).toEqual({
      sessions: 1,
      templateName: null,
      exerciseCount: 2,
      setCount: 3,
      volumeKg: 1360,
      cardioMinutes: 0,
    });
    expect(await todayWorkoutSummary(db, userId, "2026-10-20")).toBeNull();
  });

  it("data is isolated per user", async () => {
    const { db, userId, otherId, slug } = await setup();
    const bench = slug("barbell-bench-press");
    const s = await startSession(db, userId, "2026-10-19");
    await upsertSet(db, userId, s.id, bench.id, {
      setIndex: 1,
      weightKg: 60,
      reps: 8,
    });
    const tpl = await createTemplateFromSession(db, userId, s.id, "A");
    await finishSession(db, userId, s.id);

    expect(await getActiveSession(db, otherId, "2026-10-19")).toBeNull();
    await expect(finishSession(db, otherId, s.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      upsertSet(db, otherId, s.id, bench.id, {
        setIndex: 2,
        weightKg: 1,
        reps: 1,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      createTemplateFromSession(db, otherId, s.id, "x"),
    ).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      startSession(db, otherId, "2026-10-19", tpl.id),
    ).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(deleteTemplate(db, otherId, tpl.id)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await listTemplates(db, otherId)).toEqual([]);
    expect(
      (await weekStats(db, otherId, "2026-10-19", "2026-10-25")).sessions,
    ).toBe(0);
    expect(await todayWorkoutSummary(db, otherId, "2026-10-19")).toBeNull();
    // other user's history does not feed my last/PR
    const mine = await startSession(db, otherId, "2026-10-20");
    await addItem(db, otherId, mine.id, bench.id);
    const item = (await getActiveSession(db, otherId, "2026-10-20"))?.items[0];
    expect(item?.last).toBeNull();
    await deleteTemplate(db, userId, tpl.id);
    expect(await listTemplates(db, userId)).toEqual([]);
  });

  it("finishing twice throws on the second call and today summary names the template", async () => {
    const { db, userId, slug } = await setup();
    const bench = slug("barbell-bench-press");
    const s = await startSession(db, userId, "2026-10-19");
    await upsertSet(db, userId, s.id, bench.id, {
      setIndex: 1,
      weightKg: 60,
      reps: 8,
    });
    const tpl = await createTemplateFromSession(db, userId, s.id, "推日");
    await finishSession(db, userId, s.id);
    await expect(finishSession(db, userId, s.id)).rejects.toMatchObject({
      code: "already_finished",
    });
    const t1 = await startSession(db, userId, "2026-10-19", tpl.id);
    await upsertCardio(db, userId, t1.id, slug("jump-rope").id, {
      entryIndex: 1,
      durationMin: 5,
    });
    await finishSession(db, userId, t1.id);
    // mixed (blank + template) sessions on one day
    expect(await todayWorkoutSummary(db, userId, "2026-10-19")).toMatchObject({
      sessions: 2,
      templateName: null,
      exerciseCount: 2,
    });
    const t2 = await startSession(db, userId, "2026-10-20", tpl.id);
    await upsertSet(db, userId, t2.id, bench.id, {
      setIndex: 1,
      weightKg: 60,
      reps: 8,
    });
    await finishSession(db, userId, t2.id);
    expect(await todayWorkoutSummary(db, userId, "2026-10-20")).toMatchObject({
      templateName: "推日",
      exerciseCount: 1,
    });
  });

  describe("round trips", () => {
    const STRENGTH = [
      "barbell-bench-press",
      "barbell-back-squat",
      "barbell-row",
      "overhead-press",
      "romanian-deadlift",
    ];

    it("upsertSet plus response uses at most 5 queries", async () => {
      const { db, statements, userId, slug } = await setup();
      const bench = slug(STRENGTH[0] as string);
      const s = await startSession(db, userId, "2026-10-19");
      statements.reset();
      const out = await upsertSet(db, userId, s.id, bench.id, {
        setIndex: 1,
        weightKg: 60,
        reps: 5,
      });
      expect(statements.count).toBeLessThanOrEqual(5);
      expect(out.items[0]?.exercise.id).toBe(bench.id);
      expect(out).toEqual(await getSessionById(db, userId, s.id));
    });

    it("getActiveSession query count does not grow with item count", async () => {
      const { db, statements, userId, slug } = await setup();
      const ids = STRENGTH.map((x) => slug(x).id);
      // History so that "last" has something to find for every exercise.
      const old = await startSession(db, userId, "2026-10-10");
      for (const id of ids) {
        await upsertSet(db, userId, old.id, id, {
          setIndex: 1,
          weightKg: 50,
          reps: 8,
        });
      }
      await finishSession(db, userId, old.id);

      const s = await startSession(db, userId, "2026-10-19");
      await addItem(db, userId, s.id, ids[0] as string);
      statements.reset();
      const one = await getActiveSession(db, userId, "2026-10-19");
      const withOne = statements.count;

      for (const id of ids.slice(1)) await addItem(db, userId, s.id, id);
      statements.reset();
      const five = await getActiveSession(db, userId, "2026-10-19");
      expect(statements.count).toBe(withOne);
      expect(statements.count).toBeLessThanOrEqual(4);
      expect(one?.items).toHaveLength(1);
      expect(five?.items).toHaveLength(5);
      expect(five?.items.every((i) => i.last?.date === "2026-10-10")).toBe(
        true,
      );
    });
  });
});
