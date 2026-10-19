import { calcTargets, type ProfileInput } from "@gac/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  getProfile,
  latestWeight,
  overrideTargets,
  saveProfile,
} from "../src/profile/repo";
import { bodyMetrics } from "../src/db/schema";
import { syncUser } from "../src/users/repo";
import { createTestDb } from "./db";

const input: ProfileInput = {
  sex: "male",
  birthYear: 1995,
  heightCm: 175,
  weightKg: 70.5,
  activityLevel: "moderate",
  goal: "maintain",
};

describe("profile repo", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function setup() {
    const t = await createTestDb();
    close = t.close;
    const { userId } = await syncUser(t.db, "U1", "Amy");
    return { db: t.db, userId };
  }

  it("saveProfile stores computed targets", async () => {
    const { db, userId } = await setup();
    await saveProfile(db, userId, input, "2026-10-19");
    const p = await getProfile(db, userId);
    expect(p).toEqual({
      ...input,
      targetsOverridden: false,
      targets: calcTargets(input, "2026-10-19").targets,
    });
    expect(await latestWeight(db, userId)).toBe(70.5);
  });

  it("saving twice on the same day keeps one body_metrics row", async () => {
    const { db, userId } = await setup();
    await saveProfile(db, userId, input, "2026-10-19");
    await saveProfile(db, userId, { ...input, weightKg: 71 }, "2026-10-19");
    expect(await db.select().from(bodyMetrics)).toHaveLength(1);
    expect(await latestWeight(db, userId)).toBe(71);
  });

  it("saving on a new day adds a row and latest weight wins", async () => {
    const { db, userId } = await setup();
    await saveProfile(db, userId, input, "2026-10-19");
    await saveProfile(db, userId, { ...input, weightKg: 69 }, "2026-10-20");
    expect(await db.select().from(bodyMetrics)).toHaveLength(2);
    expect(await latestWeight(db, userId)).toBe(69);
    expect((await getProfile(db, userId))?.weightKg).toBe(69);
  });

  it("overrideTargets sets flag and saveProfile resets it", async () => {
    const { db, userId } = await setup();
    await saveProfile(db, userId, input, "2026-10-19");
    const custom = { kcal: 2000, proteinG: 150, carbG: 200, fatG: 60 };
    await overrideTargets(db, userId, custom);
    const p = await getProfile(db, userId);
    expect(p?.targetsOverridden).toBe(true);
    expect(p?.targets).toEqual(custom);
    await saveProfile(db, userId, input, "2026-10-19");
    const q = await getProfile(db, userId);
    expect(q?.targetsOverridden).toBe(false);
    expect(q?.targets).toEqual(calcTargets(input, "2026-10-19").targets);
  });

  it("getProfile returns null without a profile", async () => {
    const { db, userId } = await setup();
    expect(await getProfile(db, userId)).toBeNull();
    expect(await latestWeight(db, userId)).toBeNull();
  });
});
