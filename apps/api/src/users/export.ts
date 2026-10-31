import type { DataExport } from "@gac/shared";
import { asc, desc, eq, inArray } from "drizzle-orm";
import type { StoredProgramDay } from "../ask/programs";
import {
  aiConversations,
  aiMessages,
  aiPrograms,
  aiUsageDaily,
  bodyMetrics,
  cardioEntries,
  consents,
  exercises,
  foods,
  mealItems,
  meals,
  templateItems,
  userProfiles,
  users,
  workoutSessionItems,
  workoutSessions,
  workoutSets,
  workoutTemplates,
} from "../db/schema";
import type { Db } from "./repo";

const iso = (d: Date | null) => (d === null ? null : d.toISOString());
const num = (v: string | null) => (v === null ? null : Number(v));

/** Groups rows by `key`, keeping each group in query order. */
function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

/**
 * Everything the user has stored, for GET /me/export. One query per table,
 * each filtered to the user; built-in exercises and foods appear only as
 * names. Internal ids, the LINE id and photo keys are left out.
 */
export async function exportUserData(
  db: Db,
  userId: string,
  now: Date,
): Promise<DataExport> {
  const [
    account,
    consentRows,
    profileRows,
    metricRows,
    sessionRows,
    sessionItemRows,
    setRows,
    cardioRows,
    templateRows,
    templateItemRows,
    customExerciseRows,
    mealRows,
    mealItemRows,
    customFoodRows,
    conversationRows,
    messageRows,
    programRows,
    usageRows,
  ] = await Promise.all([
    db
      .select({ displayName: users.displayName, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId)),
    db
      .select({
        doc: consents.doc,
        version: consents.version,
        agreedAt: consents.agreedAt,
      })
      .from(consents)
      .where(eq(consents.userId, userId))
      .orderBy(asc(consents.agreedAt), asc(consents.doc)),
    db.select().from(userProfiles).where(eq(userProfiles.userId, userId)),
    db
      .select()
      .from(bodyMetrics)
      .where(eq(bodyMetrics.userId, userId))
      .orderBy(asc(bodyMetrics.createdAt), asc(bodyMetrics.measuredOn)),
    db
      .select({
        id: workoutSessions.id,
        performedOn: workoutSessions.performedOn,
        startedAt: workoutSessions.startedAt,
        endedAt: workoutSessions.endedAt,
        note: workoutSessions.note,
        aiAdvice: workoutSessions.aiAdvice,
        template: workoutTemplates.name,
      })
      .from(workoutSessions)
      .leftJoin(
        workoutTemplates,
        eq(workoutTemplates.id, workoutSessions.templateId),
      )
      .where(eq(workoutSessions.userId, userId))
      .orderBy(asc(workoutSessions.startedAt)),
    db
      .select({
        sessionId: workoutSessionItems.sessionId,
        exercise: exercises.nameZh,
        position: workoutSessionItems.position,
        targetSets: workoutSessionItems.targetSets,
        targetReps: workoutSessionItems.targetReps,
      })
      .from(workoutSessionItems)
      .innerJoin(
        workoutSessions,
        eq(workoutSessions.id, workoutSessionItems.sessionId),
      )
      .innerJoin(exercises, eq(exercises.id, workoutSessionItems.exerciseId))
      .where(eq(workoutSessions.userId, userId))
      .orderBy(asc(workoutSessionItems.position)),
    db
      .select({
        sessionId: workoutSets.sessionId,
        exercise: exercises.nameZh,
        setIndex: workoutSets.setIndex,
        reps: workoutSets.reps,
        weightKg: workoutSets.weightKg,
        rpe: workoutSets.rpe,
        restSec: workoutSets.restSec,
        completedAt: workoutSets.completedAt,
      })
      .from(workoutSets)
      .innerJoin(workoutSessions, eq(workoutSessions.id, workoutSets.sessionId))
      .innerJoin(exercises, eq(exercises.id, workoutSets.exerciseId))
      .where(eq(workoutSessions.userId, userId))
      .orderBy(asc(workoutSets.completedAt), asc(workoutSets.setIndex)),
    db
      .select({
        sessionId: cardioEntries.sessionId,
        exercise: exercises.nameZh,
        entryIndex: cardioEntries.entryIndex,
        durationMin: cardioEntries.durationMin,
        distanceKm: cardioEntries.distanceKm,
        inclinePct: cardioEntries.inclinePct,
        speedKmh: cardioEntries.speedKmh,
        level: cardioEntries.level,
        completedAt: cardioEntries.completedAt,
      })
      .from(cardioEntries)
      .innerJoin(
        workoutSessions,
        eq(workoutSessions.id, cardioEntries.sessionId),
      )
      .innerJoin(exercises, eq(exercises.id, cardioEntries.exerciseId))
      .where(eq(workoutSessions.userId, userId))
      .orderBy(asc(cardioEntries.completedAt), asc(cardioEntries.entryIndex)),
    db
      .select({
        id: workoutTemplates.id,
        name: workoutTemplates.name,
        createdAt: workoutTemplates.createdAt,
      })
      .from(workoutTemplates)
      .where(eq(workoutTemplates.userId, userId))
      .orderBy(asc(workoutTemplates.createdAt)),
    db
      .select({
        templateId: templateItems.templateId,
        exercise: exercises.nameZh,
        position: templateItems.position,
        sets: templateItems.sets,
        reps: templateItems.reps,
      })
      .from(templateItems)
      .innerJoin(
        workoutTemplates,
        eq(workoutTemplates.id, templateItems.templateId),
      )
      .innerJoin(exercises, eq(exercises.id, templateItems.exerciseId))
      .where(eq(workoutTemplates.userId, userId))
      .orderBy(asc(templateItems.position)),
    db
      .select({
        nameZh: exercises.nameZh,
        nameEn: exercises.nameEn,
        kind: exercises.kind,
        muscleGroup: exercises.muscleGroup,
        equipment: exercises.equipment,
        archivedAt: exercises.archivedAt,
      })
      .from(exercises)
      .where(eq(exercises.ownerUserId, userId))
      .orderBy(asc(exercises.nameZh)),
    db
      .select({
        id: meals.id,
        eatenOn: meals.eatenOn,
        mealType: meals.mealType,
        status: meals.status,
        source: meals.source,
        createdAt: meals.createdAt,
        updatedAt: meals.updatedAt,
        confirmedAt: meals.confirmedAt,
      })
      .from(meals)
      .where(eq(meals.userId, userId))
      .orderBy(asc(meals.createdAt)),
    db
      .select({
        mealId: mealItems.mealId,
        position: mealItems.position,
        name: mealItems.name,
        food: foods.name,
        grams: mealItems.grams,
        kcal: mealItems.kcal,
        proteinG: mealItems.proteinG,
        carbG: mealItems.carbG,
        fatG: mealItems.fatG,
        aiConfidence: mealItems.aiConfidence,
      })
      .from(mealItems)
      .innerJoin(meals, eq(meals.id, mealItems.mealId))
      .leftJoin(foods, eq(foods.id, mealItems.foodId))
      .where(eq(meals.userId, userId))
      .orderBy(asc(mealItems.position)),
    db
      .select({
        name: foods.name,
        aliases: foods.aliases,
        category: foods.category,
        kcalPer100g: foods.kcalPer100g,
        proteinPer100g: foods.proteinPer100g,
        carbPer100g: foods.carbPer100g,
        fatPer100g: foods.fatPer100g,
        servingDesc: foods.servingDesc,
        createdAt: foods.createdAt,
      })
      .from(foods)
      .where(eq(foods.ownerUserId, userId))
      .orderBy(asc(foods.createdAt)),
    db
      .select({
        id: aiConversations.id,
        startedAt: aiConversations.startedAt,
        endedAt: aiConversations.endedAt,
      })
      .from(aiConversations)
      .where(eq(aiConversations.userId, userId))
      .orderBy(asc(aiConversations.startedAt)),
    db
      .select({
        conversationId: aiMessages.conversationId,
        role: aiMessages.role,
        content: aiMessages.content,
        createdAt: aiMessages.createdAt,
      })
      .from(aiMessages)
      .innerJoin(
        aiConversations,
        eq(aiConversations.id, aiMessages.conversationId),
      )
      .where(eq(aiConversations.userId, userId))
      // On a time tie the question ("user") goes before its answer.
      .orderBy(asc(aiMessages.createdAt), desc(aiMessages.role)),
    db
      .select({ days: aiPrograms.days, createdAt: aiPrograms.createdAt })
      .from(aiPrograms)
      .where(eq(aiPrograms.userId, userId))
      .orderBy(asc(aiPrograms.createdAt)),
    db
      .select({
        day: aiUsageDaily.day,
        kind: aiUsageDaily.kind,
        count: aiUsageDaily.count,
      })
      .from(aiUsageDaily)
      .where(eq(aiUsageDaily.userId, userId))
      .orderBy(asc(aiUsageDaily.day), asc(aiUsageDaily.kind)),
  ]);

  const [user] = account;
  if (!user) throw new Error("exportUserData: unknown user");

  // Program days store exercise ids; export their names instead.
  const programs = programRows.map((p) => ({
    createdAt: p.createdAt,
    days: p.days as StoredProgramDay[],
  }));
  const programExerciseIds = [
    ...new Set(
      programs.flatMap((p) =>
        p.days.flatMap((d) => d.items.map((i) => i.exerciseId)),
      ),
    ),
  ];
  const exerciseNames = new Map(
    programExerciseIds.length === 0
      ? []
      : (
          await db
            .select({ id: exercises.id, nameZh: exercises.nameZh })
            .from(exercises)
            .where(inArray(exercises.id, programExerciseIds))
        ).map((e) => [e.id, e.nameZh] as const),
  );

  const itemsBySession = groupBy(sessionItemRows, (r) => r.sessionId);
  const setsBySession = groupBy(setRows, (r) => r.sessionId);
  const cardioBySession = groupBy(cardioRows, (r) => r.sessionId);
  const itemsByTemplate = groupBy(templateItemRows, (r) => r.templateId);
  const itemsByMeal = groupBy(mealItemRows, (r) => r.mealId);
  const messagesByConversation = groupBy(messageRows, (r) => r.conversationId);

  const [profile] = profileRows;

  return {
    exportedAt: now.toISOString(),
    account: {
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
    },
    consents: consentRows.map((c) => ({
      doc: c.doc,
      version: c.version,
      agreedAt: c.agreedAt.toISOString(),
    })),
    profile: profile
      ? {
          sex: profile.sex,
          birthYear: profile.birthYear,
          heightCm: Number(profile.heightCm),
          activityLevel: profile.activityLevel,
          goal: profile.goal,
          targetKcal: profile.targetKcal,
          targetProteinG: profile.targetProteinG,
          targetCarbG: profile.targetCarbG,
          targetFatG: profile.targetFatG,
          targetsOverridden: profile.targetsOverridden,
          updatedAt: profile.updatedAt.toISOString(),
        }
      : null,
    bodyMetrics: metricRows.map((m) => ({
      measuredOn: m.measuredOn,
      weightKg: num(m.weightKg),
      bodyFatPct: num(m.bodyFatPct),
      waistCm: num(m.waistCm),
      createdAt: m.createdAt.toISOString(),
    })),
    workoutSessions: sessionRows.map((s) => ({
      performedOn: s.performedOn,
      startedAt: s.startedAt.toISOString(),
      endedAt: iso(s.endedAt),
      note: s.note,
      template: s.template,
      aiAdvice: s.aiAdvice,
      items: (itemsBySession.get(s.id) ?? []).map((i) => ({
        exercise: i.exercise,
        position: i.position,
        targetSets: i.targetSets,
        targetReps: i.targetReps,
      })),
      sets: (setsBySession.get(s.id) ?? []).map((x) => ({
        exercise: x.exercise,
        setIndex: x.setIndex,
        reps: x.reps,
        weightKg: Number(x.weightKg),
        rpe: num(x.rpe),
        restSec: x.restSec,
        completedAt: x.completedAt.toISOString(),
      })),
      cardio: (cardioBySession.get(s.id) ?? []).map((c) => ({
        exercise: c.exercise,
        entryIndex: c.entryIndex,
        durationMin: c.durationMin,
        distanceKm: num(c.distanceKm),
        inclinePct: num(c.inclinePct),
        speedKmh: num(c.speedKmh),
        level: c.level,
        completedAt: c.completedAt.toISOString(),
      })),
    })),
    workoutTemplates: templateRows.map((t) => ({
      name: t.name,
      createdAt: t.createdAt.toISOString(),
      items: (itemsByTemplate.get(t.id) ?? []).map((i) => ({
        exercise: i.exercise,
        position: i.position,
        sets: i.sets,
        reps: i.reps,
      })),
    })),
    customExercises: customExerciseRows.map((e) => ({
      ...e,
      archivedAt: iso(e.archivedAt),
    })),
    meals: mealRows.map((m) => ({
      eatenOn: m.eatenOn,
      mealType: m.mealType,
      status: m.status,
      source: m.source,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      confirmedAt: iso(m.confirmedAt),
      items: (itemsByMeal.get(m.id) ?? []).map((i) => ({
        position: i.position,
        name: i.name,
        food: i.food,
        grams: Number(i.grams),
        kcal: i.kcal,
        proteinG: Number(i.proteinG),
        carbG: Number(i.carbG),
        fatG: Number(i.fatG),
        aiConfidence: num(i.aiConfidence),
      })),
    })),
    customFoods: customFoodRows.map((f) => ({
      name: f.name,
      aliases: f.aliases,
      category: f.category,
      kcalPer100g: Number(f.kcalPer100g),
      proteinPer100g: num(f.proteinPer100g),
      carbPer100g: num(f.carbPer100g),
      fatPer100g: num(f.fatPer100g),
      servingDesc: f.servingDesc,
      createdAt: f.createdAt.toISOString(),
    })),
    aiConversations: conversationRows.map((c) => ({
      startedAt: c.startedAt.toISOString(),
      endedAt: iso(c.endedAt),
      messages: (messagesByConversation.get(c.id) ?? []).map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    })),
    aiPrograms: programs.map((p) => ({
      createdAt: p.createdAt.toISOString(),
      days: p.days.map((d) => ({
        name: d.name,
        items: d.items.map((i) => ({
          exercise: exerciseNames.get(i.exerciseId) ?? null,
          sets: i.sets,
          reps: i.reps,
        })),
      })),
    })),
    aiUsage: usageRows,
  };
}
