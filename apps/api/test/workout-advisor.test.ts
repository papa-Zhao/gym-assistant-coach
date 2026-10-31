import type Anthropic from "@anthropic-ai/sdk";
import type { Exercise } from "@gac/shared";
import type { FastifyBaseLogger } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { WORKOUT_ADVICE_MAX_TOKENS } from "../src/ai/config";
import { WORKOUT_ADVICE_SYSTEM } from "../src/ai/prompts";
import { createWorkoutAdvisor } from "../src/ai/workout-advisor";
import { saveProfile } from "../src/profile/repo";
import { syncUser } from "../src/users/repo";
import { workoutAdviceContext } from "../src/workouts/advice-context";
import {
  finishSession,
  listExercises,
  startSession,
  upsertCardio,
  upsertSet,
} from "../src/workouts/repo";
import { createTestDb } from "./db";

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

const text = (data: unknown) =>
  message([{ type: "text", text: JSON.stringify(data) }]);

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
  return { advisor: createWorkoutAdvisor(client, log), calls };
}

describe("workout advisor", () => {
  it("sends the expected request", async () => {
    const { advisor, calls } = setup(() =>
      text({ title: "不錯", points: ["a"] }),
    );
    await advisor.advise("CTX");
    const req = calls[0] as unknown as {
      max_tokens: number;
      system: { text: string; cache_control: unknown }[];
      messages: unknown;
    };
    expect(req.max_tokens).toBe(WORKOUT_ADVICE_MAX_TOKENS);
    expect(req.system[0]!.text).toBe(WORKOUT_ADVICE_SYSTEM);
    expect(req.system[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(req.messages).toEqual([{ role: "user", content: "CTX" }]);
  });

  it("parses title and points", async () => {
    const { advisor } = setup(() =>
      text({ title: " 練得很穩 ", points: ["下次臥推試 62.5 kg", "  "] }),
    );
    const r = await advisor.advise("CTX");
    expect(r).toMatchObject({
      kind: "ok",
      advice: { title: "練得很穩", points: ["下次臥推試 62.5 kg"] },
    });
  });

  it("truncates title to 20 and points to 60 chars, max 3 points", async () => {
    const { advisor } = setup(() =>
      text({
        title: "長".repeat(30),
        points: ["一".repeat(80), "二", "三", "四"],
      }),
    );
    const r = await advisor.advise("CTX");
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(Array.from(r.advice.title)).toHaveLength(20);
    expect(r.advice.points).toHaveLength(3);
    expect(Array.from(r.advice.points[0]!)).toHaveLength(60);
  });

  it("missing points is invalid", async () => {
    for (const data of [
      { title: "x" },
      { title: "x", points: [] },
      { title: "x", points: [1] },
      { title: "", points: ["a"] },
    ]) {
      const { advisor } = setup(() => text(data));
      expect((await advisor.advise("CTX")).kind).toBe("invalid");
    }
  });

  it("refusal is refused", async () => {
    const { advisor } = setup(() => message([], "refusal"));
    expect((await advisor.advise("CTX")).kind).toBe("refused");
  });

  it("system prompt has no dates", () => {
    expect(WORKOUT_ADVICE_SYSTEM).not.toMatch(/20\d\d/);
  });
});

describe("workoutAdviceContext", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it("includes sets, last time, week muscles and goal; excludes display name", async () => {
    const t = await createTestDb();
    close = t.close;
    const { db } = t;
    const { userId } = await syncUser(db, "U1", "王小明");
    await saveProfile(
      db,
      userId,
      {
        sex: "male",
        birthYear: 1992,
        heightCm: 175,
        weightKg: 72.5,
        activityLevel: "moderate",
        goal: "bulk",
      },
      "2026-10-20",
    );
    const all = await listExercises(db, userId);
    const slug = (s: string): Exercise => {
      const e = all.find((x) => x.slug === s);
      if (!e) throw new Error(`missing seed ${s}`);
      return e;
    };
    const bench = slug("barbell-bench-press");
    const old = await startSession(db, userId, "2026-10-19");
    await upsertSet(db, userId, old.id, bench.id, {
      setIndex: 1,
      weightKg: 57.5,
      reps: 8,
    });
    await finishSession(db, userId, old.id);

    const s = await startSession(db, userId, "2026-10-21");
    await upsertSet(db, userId, s.id, bench.id, {
      setIndex: 1,
      weightKg: 60,
      reps: 8,
      rpe: 8.5,
    });
    await upsertSet(db, userId, s.id, bench.id, {
      setIndex: 2,
      weightKg: 60,
      reps: 7,
      restSec: 150,
    });
    await upsertCardio(db, userId, s.id, slug("jump-rope").id, {
      entryIndex: 1,
      durationMin: 10,
    });
    await finishSession(db, userId, s.id);

    const ctx = await workoutAdviceContext(db, userId, s.id);
    expect(ctx).toContain("目標：增肌");
    expect(ctx).toContain("槓鈴臥推");
    expect(ctx).toContain("60 kg × 8 下（RPE 8.5）");
    expect(ctx).toContain("60 kg × 7 下（休息 2:30）");
    expect(ctx).toContain("上一次：57.5 kg × 8 下");
    expect(ctx).toContain("10 分鐘");
    expect(ctx).toContain("本週各肌群組數：胸 3");
    expect(ctx).not.toContain("王小明");
  });
});
