import {
  calcTargets,
  type ActivityLevel,
  type Goal,
  type ProfileInput,
  type Sex,
  type Targets,
} from "@gac/shared";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { bodyMetrics, userProfiles } from "../db/schema";
import type { Db } from "../users/repo";

export type StoredProfile = ProfileInput & {
  targetsOverridden: boolean;
  targets: Targets;
};

/** `today` is a `YYYY-MM-DD` Asia/Taipei date supplied by the caller. */
export async function saveProfile(
  db: Db,
  userId: string,
  input: ProfileInput,
  today: string,
): Promise<void> {
  const { targets } = calcTargets(input, today);
  const values = {
    sex: input.sex,
    birthYear: input.birthYear,
    heightCm: String(input.heightCm),
    activityLevel: input.activityLevel,
    goal: input.goal,
    targetKcal: targets.kcal,
    targetProteinG: targets.proteinG,
    targetCarbG: targets.carbG,
    targetFatG: targets.fatG,
    targetsOverridden: false,
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(userProfiles)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: userProfiles.userId, set: values });
    await tx
      .insert(bodyMetrics)
      .values({ userId, measuredOn: today, weightKg: String(input.weightKg) })
      .onConflictDoUpdate({
        target: [bodyMetrics.userId, bodyMetrics.measuredOn],
        set: { weightKg: String(input.weightKg) },
      });
  });
}

export async function latestWeight(
  db: Db,
  userId: string,
): Promise<number | null> {
  const [row] = await db
    .select({ weightKg: bodyMetrics.weightKg })
    .from(bodyMetrics)
    .where(and(eq(bodyMetrics.userId, userId), isNotNull(bodyMetrics.weightKg)))
    .orderBy(desc(bodyMetrics.measuredOn))
    .limit(1);
  return row?.weightKg == null ? null : Number(row.weightKg);
}

export async function getProfile(
  db: Db,
  userId: string,
): Promise<StoredProfile | null> {
  const [row] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId));
  if (!row) return null;
  const weightKg = await latestWeight(db, userId);
  if (weightKg === null) return null;
  return {
    sex: row.sex as Sex,
    birthYear: row.birthYear,
    heightCm: Number(row.heightCm),
    weightKg,
    activityLevel: row.activityLevel as ActivityLevel,
    goal: row.goal as Goal,
    targetsOverridden: row.targetsOverridden,
    targets: {
      kcal: row.targetKcal,
      proteinG: row.targetProteinG,
      carbG: row.targetCarbG,
      fatG: row.targetFatG,
    },
  };
}

export async function overrideTargets(
  db: Db,
  userId: string,
  targets: Targets,
): Promise<void> {
  await db
    .update(userProfiles)
    .set({
      targetKcal: targets.kcal,
      targetProteinG: targets.proteinG,
      targetCarbG: targets.carbG,
      targetFatG: targets.fatG,
      targetsOverridden: true,
      updatedAt: new Date(),
    })
    .where(eq(userProfiles.userId, userId));
}
