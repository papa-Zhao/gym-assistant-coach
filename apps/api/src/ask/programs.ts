import type { SaveProgramDayResponse } from "@gac/shared";
import { and, eq, gte } from "drizzle-orm";
import { aiPrograms, templateItems, workoutTemplates } from "../db/schema";
import type { Db } from "../users/repo";
import { ASK_RETENTION_DAYS } from "./repo";

export interface StoredProgramDay {
  name: string;
  items: { exerciseId: string; sets: number; reps: number }[];
}

const DAY_MS = 86_400_000;

/** Saves a shaped program; returns its id. */
export async function createProgram(
  db: Db,
  userId: string,
  days: StoredProgramDay[],
  now: Date,
): Promise<string> {
  const [row] = await db
    .insert(aiPrograms)
    .values({ userId, days, createdAt: now })
    .returning({ id: aiPrograms.id });
  if (!row) throw new Error("createProgram: no row");
  return row.id;
}

/**
 * Saves day `day` (1-based) of the user's program as a template named after the day.
 * null when the program is missing, another user's, older than ASK_RETENTION_DAYS, or has no such day.
 */
export async function saveProgramDay(
  db: Db,
  userId: string,
  programId: string,
  day: number,
  now: Date,
): Promise<SaveProgramDayResponse | null> {
  const cutoff = new Date(now.getTime() - ASK_RETENTION_DAYS * DAY_MS);
  return db.transaction(async (tx) => {
    const [program] = await tx
      .select({ days: aiPrograms.days })
      .from(aiPrograms)
      .where(
        and(
          eq(aiPrograms.id, programId),
          eq(aiPrograms.userId, userId),
          gte(aiPrograms.createdAt, cutoff),
        ),
      )
      .limit(1);
    const target = (program?.days as StoredProgramDay[] | undefined)?.[day - 1];
    if (!target) return null;

    const existing = async () =>
      (
        await tx
          .select({ name: workoutTemplates.name })
          .from(workoutTemplates)
          .where(
            and(
              eq(workoutTemplates.sourceProgramId, programId),
              eq(workoutTemplates.sourceDay, day),
              eq(workoutTemplates.userId, userId),
            ),
          )
          .limit(1)
      )[0];
    const found = await existing();
    if (found) return { outcome: "already_saved", templateName: found.name };

    // The partial unique index lets only one concurrent insert win.
    const [tpl] = await tx
      .insert(workoutTemplates)
      .values({
        userId,
        name: target.name,
        sourceProgramId: programId,
        sourceDay: day,
      })
      .onConflictDoNothing()
      .returning({ id: workoutTemplates.id });
    if (!tpl) {
      const raced = await existing();
      if (!raced) throw new Error("saveProgramDay: no template");
      return { outcome: "already_saved", templateName: raced.name };
    }
    if (target.items.length > 0) {
      await tx.insert(templateItems).values(
        target.items.map((it, position) => ({
          templateId: tpl.id,
          exerciseId: it.exerciseId,
          position,
          sets: it.sets,
          reps: it.reps,
        })),
      );
    }
    return { outcome: "saved", templateName: target.name };
  });
}
