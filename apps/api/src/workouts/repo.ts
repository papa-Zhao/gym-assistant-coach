import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  bestE1RM,
  equipmentCategory,
  estimate1RM,
  overloadHint,
  volume,
  type ActiveSession,
  type CardioEntry,
  type Equipment,
  type EquipmentCategory,
  type Exercise,
  type ExerciseKind,
  type FinishSummary,
  type MuscleGroup,
  type SessionItem,
  type Template,
  type WeekStats,
  type WorkoutSet,
} from "@gac/shared";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import {
  cardioEntries,
  exercises,
  templateItems,
  workoutSessionItems,
  workoutSessions,
  workoutSets,
  workoutTemplates,
} from "../db/schema";
import type { Db } from "../users/repo";

/** Longest template name, in code points. */
export const MAX_TEMPLATE_NAME = 30;

export type WorkoutErrorCode =
  | "not_found"
  | "already_finished"
  | "session_finished"
  | "wrong_kind"
  | "not_finished"
  | "empty_session";

/** Typed failure so routes can map it to 404 / 409 / 400. */
export class WorkoutError extends Error {
  constructor(readonly code: WorkoutErrorCode) {
    super(code);
    this.name = "WorkoutError";
  }
}

type ExerciseRow = typeof exercises.$inferSelect;

function toExercise(r: ExerciseRow): Exercise {
  const equipment = r.equipment as Equipment;
  return {
    id: r.id,
    slug: r.slug,
    nameZh: r.nameZh,
    nameEn: r.nameEn,
    kind: r.kind as ExerciseKind,
    muscleGroup: r.muscleGroup as MuscleGroup | null,
    equipment,
    equipmentCategory: equipmentCategory(equipment),
    isCustom: r.isCustom,
  };
}

const num = (v: string | number | null) => (v === null ? undefined : Number(v));

/** Built-in exercises plus the user's own, never anyone else's. */
const visibleTo = (userId: string) =>
  or(eq(exercises.isCustom, false), eq(exercises.ownerUserId, userId));

// ---------- exercises ----------

export async function listExercises(
  db: Db,
  userId: string,
  opts: {
    q?: string;
    muscle?: MuscleGroup;
    category?: EquipmentCategory;
    kind?: ExerciseKind;
  } = {},
): Promise<Exercise[]> {
  const conds = [visibleTo(userId), isNull(exercises.archivedAt)];
  const q = opts.q?.trim();
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    conds.push(
      or(
        sql`${exercises.nameZh} ilike ${pattern}`,
        sql`${exercises.nameEn} ilike ${pattern}`,
      ),
    );
  }
  if (opts.muscle) conds.push(eq(exercises.muscleGroup, opts.muscle));
  if (opts.kind) conds.push(eq(exercises.kind, opts.kind));
  if (opts.category) {
    const category = opts.category;
    conds.push(
      inArray(
        exercises.equipment,
        EQUIPMENT.filter((e) => equipmentCategory(e) === category),
      ),
    );
  }
  const rows = await db
    .select()
    .from(exercises)
    .where(and(...conds))
    .orderBy(asc(exercises.kind), asc(exercises.nameZh));
  return rows.map(toExercise);
}

/** Built-in, non-archived exercises ordered by slug. */
export async function listBuiltinExercises(db: Db): Promise<Exercise[]> {
  const rows = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.isCustom, false), isNull(exercises.archivedAt)))
    .orderBy(asc(exercises.slug));
  return rows.map(toExercise);
}

export interface CustomExerciseInput {
  nameZh: string;
  nameEn?: string | null;
  kind: ExerciseKind;
  muscleGroup?: MuscleGroup | null;
  equipment: Equipment;
}

export async function createCustomExercise(
  db: Db,
  userId: string,
  input: CustomExerciseInput,
): Promise<Exercise> {
  const [row] = await db
    .insert(exercises)
    .values({
      nameZh: input.nameZh,
      nameEn: input.nameEn ?? null,
      kind: input.kind,
      muscleGroup: input.kind === "cardio" ? null : (input.muscleGroup ?? null),
      equipment: input.equipment,
      isCustom: true,
      ownerUserId: userId,
    })
    .returning();
  if (!row) throw new Error("createCustomExercise: insert returned no row");
  return toExercise(row);
}

/**
 * Hard-deletes an unused custom exercise; archives it when any set, cardio
 * entry, session item or template still references it.
 */
export async function archiveCustomExercise(
  db: Db,
  userId: string,
  exerciseId: string,
): Promise<"deleted" | "archived"> {
  return db.transaction(async (tx) => {
    const [ex] = await tx
      .select({ id: exercises.id })
      .from(exercises)
      .where(
        and(
          eq(exercises.id, exerciseId),
          eq(exercises.isCustom, true),
          eq(exercises.ownerUserId, userId),
        ),
      );
    if (!ex) throw new WorkoutError("not_found");
    const used = await Promise.all([
      tx
        .select({ n: sql<number>`1` })
        .from(workoutSets)
        .where(eq(workoutSets.exerciseId, exerciseId))
        .limit(1),
      tx
        .select({ n: sql<number>`1` })
        .from(cardioEntries)
        .where(eq(cardioEntries.exerciseId, exerciseId))
        .limit(1),
      tx
        .select({ n: sql<number>`1` })
        .from(templateItems)
        .where(eq(templateItems.exerciseId, exerciseId))
        .limit(1),
      tx
        .select({ n: sql<number>`1` })
        .from(workoutSessionItems)
        .where(eq(workoutSessionItems.exerciseId, exerciseId))
        .limit(1),
    ]);
    if (used.some((r) => r.length > 0)) {
      await tx
        .update(exercises)
        .set({ archivedAt: new Date() })
        .where(eq(exercises.id, exerciseId));
      return "archived";
    }
    await tx.delete(exercises).where(eq(exercises.id, exerciseId));
    return "deleted";
  });
}

// ---------- templates ----------

async function loadTemplates(
  db: Db,
  where: ReturnType<typeof and>,
): Promise<Template[]> {
  const templates = await db
    .select()
    .from(workoutTemplates)
    .where(where)
    .orderBy(desc(workoutTemplates.createdAt), asc(workoutTemplates.name));
  if (templates.length === 0) return [];
  const items = await db
    .select({ item: templateItems, exercise: exercises })
    .from(templateItems)
    .innerJoin(exercises, eq(exercises.id, templateItems.exerciseId))
    .where(
      inArray(
        templateItems.templateId,
        templates.map((t) => t.id),
      ),
    )
    .orderBy(asc(templateItems.position));
  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    items: items
      .filter((i) => i.item.templateId === t.id)
      .map((i) => ({
        exercise: toExercise(i.exercise),
        targetSets: i.item.sets,
        targetReps: i.item.reps,
      })),
  }));
}

export function listTemplates(db: Db, userId: string): Promise<Template[]> {
  return loadTemplates(db, eq(workoutTemplates.userId, userId));
}

/** Strength items only; targets fall back to what was actually done. */
export async function createTemplateFromSession(
  db: Db,
  userId: string,
  sessionId: string,
  name: string,
  opts: { requireFinished?: boolean } = {},
): Promise<Template> {
  const id = await db.transaction(async (tx) => {
    const session = await requireSession(tx, userId, sessionId);
    if (opts.requireFinished && session.endedAt === null) {
      throw new WorkoutError("not_finished");
    }
    const items = await tx
      .select({ item: workoutSessionItems, kind: exercises.kind })
      .from(workoutSessionItems)
      .innerJoin(exercises, eq(exercises.id, workoutSessionItems.exerciseId))
      .where(eq(workoutSessionItems.sessionId, sessionId))
      .orderBy(asc(workoutSessionItems.position));
    const sets = await tx
      .select()
      .from(workoutSets)
      .where(eq(workoutSets.sessionId, sessionId))
      .orderBy(asc(workoutSets.setIndex));
    const rows: (typeof templateItems.$inferInsert)[] = [];
    for (const { item, kind } of items) {
      if (kind !== "strength") continue;
      const done = sets.filter((s) => s.exerciseId === item.exerciseId);
      const targetSets = item.targetSets ?? (done.length || null);
      const targetReps = item.targetReps ?? done[0]?.reps ?? null;
      if (targetSets === null || targetReps === null) continue;
      rows.push({
        templateId: "",
        exerciseId: item.exerciseId,
        position: rows.length,
        sets: targetSets,
        reps: targetReps,
      });
    }
    const [tpl] = await tx
      .insert(workoutTemplates)
      .values({ userId, name })
      .returning({ id: workoutTemplates.id });
    if (!tpl) throw new Error("createTemplateFromSession: no row");
    if (rows.length > 0) {
      await tx
        .insert(templateItems)
        .values(rows.map((r) => ({ ...r, templateId: tpl.id })));
    }
    return tpl.id;
  });
  const [created] = await loadTemplates(db, eq(workoutTemplates.id, id));
  if (!created) throw new Error("createTemplateFromSession: missing");
  return created;
}

export async function deleteTemplate(
  db: Db,
  userId: string,
  templateId: string,
): Promise<void> {
  const rows = await db
    .delete(workoutTemplates)
    .where(
      and(
        eq(workoutTemplates.id, templateId),
        eq(workoutTemplates.userId, userId),
      ),
    )
    .returning({ id: workoutTemplates.id });
  if (rows.length === 0) throw new WorkoutError("not_found");
}

// ---------- sessions ----------

type SessionRow = typeof workoutSessions.$inferSelect;

async function requireSession(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<SessionRow> {
  const [row] = await db
    .select()
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.id, sessionId),
        eq(workoutSessions.userId, userId),
      ),
    );
  if (!row) throw new WorkoutError("not_found");
  return row;
}

/** A validated session row plus the name of the template it came from. */
interface SessionContext {
  session: SessionRow;
  templateName: string | null;
}

const sessionContextColumns = {
  session: workoutSessions,
  templateName: workoutTemplates.name,
};

/** One query: the user's in-progress session (or `not_found` / `session_finished`) with its template name. */
async function requireActiveSession(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<SessionContext> {
  const [row] = await db
    .select(sessionContextColumns)
    .from(workoutSessions)
    .leftJoin(
      workoutTemplates,
      eq(workoutTemplates.id, workoutSessions.templateId),
    )
    .where(
      and(
        eq(workoutSessions.id, sessionId),
        eq(workoutSessions.userId, userId),
      ),
    );
  if (!row) throw new WorkoutError("not_found");
  if (row.session.endedAt !== null) throw new WorkoutError("session_finished");
  return row;
}

/**
 * One query that validates both the in-progress session and the visible
 * exercise. Errors keep the order of the former two-step check: session
 * problems first, then the exercise.
 */
async function requireSessionAndExercise(
  db: Db,
  userId: string,
  sessionId: string,
  exerciseId: string,
): Promise<SessionContext & { exercise: Exercise }> {
  const [row] = await db
    .select({ ...sessionContextColumns, exercise: exercises })
    .from(workoutSessions)
    .leftJoin(
      workoutTemplates,
      eq(workoutTemplates.id, workoutSessions.templateId),
    )
    .leftJoin(exercises, and(eq(exercises.id, exerciseId), visibleTo(userId)))
    .where(
      and(
        eq(workoutSessions.id, sessionId),
        eq(workoutSessions.userId, userId),
      ),
    );
  if (!row) throw new WorkoutError("not_found");
  if (row.session.endedAt !== null) throw new WorkoutError("session_finished");
  if (!row.exercise) throw new WorkoutError("not_found");
  return { ...row, exercise: toExercise(row.exercise) };
}

interface SetJson {
  setIndex: number;
  weightKg: number | string;
  reps: number;
  rpe: number | string | null;
  restSec: number | null;
  completedAt: string;
}

interface CardioJson {
  entryIndex: number;
  durationMin: number;
  distanceKm: number | string | null;
  inclinePct: number | string | null;
  speedKmh: number | string | null;
  level: number | null;
}

function toWorkoutSet(r: SetJson): WorkoutSet {
  const rpe = num(r.rpe);
  return {
    setIndex: r.setIndex,
    weightKg: Number(r.weightKg),
    reps: r.reps,
    ...(rpe !== undefined ? { rpe } : {}),
    ...(r.restSec !== null ? { restSec: r.restSec } : {}),
    completedAt: new Date(r.completedAt).toISOString(),
  };
}

function toCardioEntry(r: CardioJson): CardioEntry {
  const distanceKm = num(r.distanceKm);
  const inclinePct = num(r.inclinePct);
  const speedKmh = num(r.speedKmh);
  return {
    entryIndex: r.entryIndex,
    durationMin: r.durationMin,
    ...(distanceKm !== undefined ? { distanceKm } : {}),
    ...(inclinePct !== undefined ? { inclinePct } : {}),
    ...(speedKmh !== undefined ? { speedKmh } : {}),
    ...(r.level !== null ? { level: r.level } : {}),
  };
}

/**
 * Everything keyed by exercise for one session in a single statement:
 * this session's sets and cardio, plus, for every exercise in it, the sets of
 * the most recent other finished session that has that exercise ("last").
 * Rows are `kind`, `exerciseId` and a JSON document in `data` (as text, so
 * the result is the same on every driver).
 */
function sessionDataQuery(db: Db, userId: string, sessionId: string) {
  const json = (expr: ReturnType<typeof sql>) => sql<string>`(${expr})::text`;
  const setFields = sql`'setIndex', ${workoutSets.setIndex}, 'weightKg', ${workoutSets.weightKg}, 'reps', ${workoutSets.reps}, 'rpe', ${workoutSets.rpe}, 'restSec', ${workoutSets.restSec}, 'completedAt', ${workoutSets.completedAt}`;

  // Source session per exercise, via distinct on.
  const src = db
    .selectDistinctOn([workoutSets.exerciseId], {
      sessionId: workoutSets.sessionId,
      exerciseId: workoutSets.exerciseId,
      date: workoutSessions.performedOn,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSessions.id, workoutSets.sessionId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        isNotNull(workoutSessions.endedAt),
        ne(workoutSessions.id, sessionId),
        inArray(
          workoutSets.exerciseId,
          db
            .select({ id: workoutSessionItems.exerciseId })
            .from(workoutSessionItems)
            .where(eq(workoutSessionItems.sessionId, sessionId)),
        ),
      ),
    )
    .orderBy(
      asc(workoutSets.exerciseId),
      desc(workoutSessions.performedOn),
      desc(workoutSessions.endedAt),
    )
    .as("src");

  const mine = db
    .select({
      kind: sql<string>`'set'::text`.as("kind"),
      exerciseId: workoutSets.exerciseId,
      data: json(sql`jsonb_build_object(${setFields})`).as("data"),
    })
    .from(workoutSets)
    .where(eq(workoutSets.sessionId, sessionId));
  const cardio = db
    .select({
      kind: sql<string>`'cardio'::text`,
      exerciseId: cardioEntries.exerciseId,
      data: json(
        sql`jsonb_build_object('entryIndex', ${cardioEntries.entryIndex}, 'durationMin', ${cardioEntries.durationMin}, 'distanceKm', ${cardioEntries.distanceKm}, 'inclinePct', ${cardioEntries.inclinePct}, 'speedKmh', ${cardioEntries.speedKmh}, 'level', ${cardioEntries.level})`,
      ),
    })
    .from(cardioEntries)
    .where(eq(cardioEntries.sessionId, sessionId));
  const last = db
    .select({
      kind: sql<string>`'last'::text`,
      exerciseId: workoutSets.exerciseId,
      data: json(sql`jsonb_build_object('date', ${src.date}, ${setFields})`),
    })
    .from(workoutSets)
    .innerJoin(
      src,
      and(
        eq(workoutSets.sessionId, src.sessionId),
        eq(workoutSets.exerciseId, src.exerciseId),
      ),
    );
  return unionAll(mine, cardio, last);
}

/** Two statements however many items: the items, then {@link sessionDataQuery}. */
async function buildSession(
  db: Db,
  userId: string,
  { session, templateName }: SessionContext,
): Promise<ActiveSession> {
  const [items, data] = await Promise.all([
    db
      .select({ item: workoutSessionItems, exercise: exercises })
      .from(workoutSessionItems)
      .innerJoin(exercises, eq(exercises.id, workoutSessionItems.exerciseId))
      .where(eq(workoutSessionItems.sessionId, session.id))
      .orderBy(asc(workoutSessionItems.position)),
    sessionDataQuery(db, userId, session.id),
  ]);

  const sets = new Map<string, WorkoutSet[]>();
  const cardio = new Map<string, CardioEntry[]>();
  const lastRows = new Map<string, { date: string; sets: WorkoutSet[] }>();
  const push = <T>(m: Map<string, T[]>, k: string, v: T) =>
    m.set(k, [...(m.get(k) ?? []), v]);
  for (const row of data) {
    const d = JSON.parse(row.data) as SetJson & CardioJson & { date: string };
    if (row.kind === "set") push(sets, row.exerciseId, toWorkoutSet(d));
    else if (row.kind === "cardio")
      push(cardio, row.exerciseId, toCardioEntry(d));
    else {
      const entry = lastRows.get(row.exerciseId) ?? { date: d.date, sets: [] };
      entry.sets.push(toWorkoutSet(d));
      lastRows.set(row.exerciseId, entry);
    }
  }
  const byIndex = <T extends { setIndex?: number; entryIndex?: number }>(
    xs: T[] | undefined,
  ) =>
    [...(xs ?? [])].sort(
      (a, b) =>
        (a.setIndex ?? a.entryIndex ?? 0) - (b.setIndex ?? b.entryIndex ?? 0),
    );

  const out: SessionItem[] = items.map(({ item, exercise }) => {
    const ex = toExercise(exercise);
    const base = {
      exercise: ex,
      targetSets: item.targetSets,
      targetReps: item.targetReps,
    };
    if (ex.kind === "cardio") {
      return {
        ...base,
        last: null,
        hint: null,
        cardio: byIndex(cardio.get(ex.id)),
      };
    }
    const found = lastRows.get(ex.id);
    const last = found ? { date: found.date, sets: byIndex(found.sets) } : null;
    return {
      ...base,
      last,
      hint: last ? overloadHint(last.sets, item.targetReps) : null,
      sets: byIndex(sets.get(ex.id)),
    };
  });
  return {
    id: session.id,
    date: session.performedOn,
    startedAt: session.startedAt.toISOString(),
    templateId: session.templateId,
    templateName,
    items: out,
  };
}

async function findActive(
  db: Db,
  userId: string,
): Promise<SessionContext | null> {
  const [row] = await db
    .select(sessionContextColumns)
    .from(workoutSessions)
    .leftJoin(
      workoutTemplates,
      eq(workoutTemplates.id, workoutSessions.templateId),
    )
    .where(
      and(eq(workoutSessions.userId, userId), isNull(workoutSessions.endedAt)),
    );
  return row ?? null;
}

/** The user's session by id (any state) as an `ActiveSession` shape; `not_found` if foreign. */
export async function getSessionById(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<ActiveSession> {
  const [row] = await db
    .select(sessionContextColumns)
    .from(workoutSessions)
    .leftJoin(
      workoutTemplates,
      eq(workoutTemplates.id, workoutSessions.templateId),
    )
    .where(
      and(
        eq(workoutSessions.id, sessionId),
        eq(workoutSessions.userId, userId),
      ),
    );
  if (!row) throw new WorkoutError("not_found");
  return buildSession(db, userId, row);
}

/** The user's in-progress session, or null. `today` is reserved for callers. */
export async function getActiveSession(
  db: Db,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- part of the agreed signature
  _today: string,
): Promise<ActiveSession | null> {
  const ctx = await findActive(db, userId);
  return ctx ? buildSession(db, userId, ctx) : null;
}

/** Returns the existing in-progress session if there is one. */
export async function startSession(
  db: Db,
  userId: string,
  today: string,
  templateId?: string,
): Promise<ActiveSession> {
  const existing = await findActive(db, userId);
  if (existing) return buildSession(db, userId, existing);

  const [template] = templateId
    ? await loadTemplates(
        db,
        and(
          eq(workoutTemplates.id, templateId),
          eq(workoutTemplates.userId, userId),
        ),
      )
    : [];
  if (templateId && !template) throw new WorkoutError("not_found");

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(workoutSessions)
      .values({
        userId,
        performedOn: today,
        templateId: template?.id ?? null,
      })
      .onConflictDoNothing()
      .returning();
    if (row && template && template.items.length > 0) {
      await tx.insert(workoutSessionItems).values(
        template.items.map((i, position) => ({
          sessionId: row.id,
          exerciseId: i.exercise.id,
          position,
          targetSets: i.targetSets,
          targetReps: i.targetReps,
        })),
      );
    }
    return row;
  });
  // Lost a race with a concurrent start: return the winner.
  if (created) {
    return buildSession(db, userId, {
      session: created,
      templateName: template?.name ?? null,
    });
  }
  const winner = await findActive(db, userId);
  if (!winner) throw new Error("startSession: no session");
  return buildSession(db, userId, winner);
}

/** One statement: append the exercise at the next position unless it is already there. */
async function ensureItem(
  db: Db,
  sessionId: string,
  exerciseId: string,
  targets: { targetSets?: number; targetReps?: number } = {},
): Promise<void> {
  await db
    .insert(workoutSessionItems)
    .select(
      db
        .select({
          sessionId: sql<string>`${sessionId}::uuid`.as("session_id"),
          exerciseId: sql<string>`${exerciseId}::uuid`.as("exercise_id"),
          position:
            sql<number>`coalesce(max(${workoutSessionItems.position}) + 1, 0)::int`.as(
              "position",
            ),
          targetSets: sql<number | null>`${targets.targetSets ?? null}::int`.as(
            "target_sets",
          ),
          targetReps: sql<number | null>`${targets.targetReps ?? null}::int`.as(
            "target_reps",
          ),
        })
        .from(workoutSessionItems)
        .where(eq(workoutSessionItems.sessionId, sessionId)),
    )
    .onConflictDoNothing();
}

export async function addItem(
  db: Db,
  userId: string,
  sessionId: string,
  exerciseId: string,
  targets: { targetSets?: number; targetReps?: number } = {},
): Promise<ActiveSession> {
  const ctx = await requireSessionAndExercise(
    db,
    userId,
    sessionId,
    exerciseId,
  );
  await ensureItem(db, sessionId, exerciseId, targets);
  return buildSession(db, userId, ctx);
}

async function requireKind(
  db: Db,
  userId: string,
  sessionId: string,
  exerciseId: string,
  kind: ExerciseKind,
): Promise<SessionContext> {
  const ctx = await requireSessionAndExercise(
    db,
    userId,
    sessionId,
    exerciseId,
  );
  if (ctx.exercise.kind !== kind) throw new WorkoutError("wrong_kind");
  await ensureItem(db, sessionId, exerciseId);
  return ctx;
}

/** Writes the set, then returns the session as the client should now see it. */
export async function upsertSet(
  db: Db,
  userId: string,
  sessionId: string,
  exerciseId: string,
  set: {
    setIndex: number;
    weightKg: number;
    reps: number;
    rpe?: number;
    restSec?: number;
  },
): Promise<ActiveSession> {
  const ctx = await requireKind(db, userId, sessionId, exerciseId, "strength");
  const values = {
    reps: set.reps,
    weightKg: String(set.weightKg),
    rpe: set.rpe === undefined ? null : String(set.rpe),
  };
  // completedAt is set on insert only: an edit keeps the original time.
  // Omitted restSec: null on insert, the stored value kept on update.
  const restSec = set.restSec === undefined ? {} : { restSec: set.restSec };
  await db
    .insert(workoutSets)
    .values({
      sessionId,
      exerciseId,
      setIndex: set.setIndex,
      ...values,
      ...restSec,
      completedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        workoutSets.sessionId,
        workoutSets.exerciseId,
        workoutSets.setIndex,
      ],
      set: { ...values, ...restSec },
    });
  return buildSession(db, userId, ctx);
}

/**
 * Removes an exercise, with this session's sets and cardio for it, from the
 * in-progress session: one statement, so all or nothing. `not_found` when the
 * exercise is not in the session.
 */
export async function removeItem(
  db: Db,
  userId: string,
  sessionId: string,
  exerciseId: string,
): Promise<ActiveSession> {
  const ctx = await requireActiveSession(db, userId, sessionId);
  const item = db.$with("item").as(
    db
      .delete(workoutSessionItems)
      .where(
        and(
          eq(workoutSessionItems.sessionId, sessionId),
          eq(workoutSessionItems.exerciseId, exerciseId),
        ),
      )
      .returning({ exerciseId: workoutSessionItems.exerciseId }),
  );
  const found = sql`exists (select 1 from ${item})`;
  const sets = db.$with("removed_sets").as(
    db
      .delete(workoutSets)
      .where(
        and(
          eq(workoutSets.sessionId, sessionId),
          eq(workoutSets.exerciseId, exerciseId),
          found,
        ),
      )
      .returning({ n: sql<number>`1`.as("n") }),
  );
  const cardio = db.$with("removed_cardio").as(
    db
      .delete(cardioEntries)
      .where(
        and(
          eq(cardioEntries.sessionId, sessionId),
          eq(cardioEntries.exerciseId, exerciseId),
          found,
        ),
      )
      .returning({ n: sql<number>`1`.as("n") }),
  );
  const [{ removed } = { removed: 0 }] = await db
    .with(item, sets, cardio)
    .select({ removed: sql<number>`count(*)::int` })
    .from(item);
  if (removed === 0) throw new WorkoutError("not_found");
  return buildSession(db, userId, ctx);
}

export async function deleteSet(
  db: Db,
  userId: string,
  sessionId: string,
  exerciseId: string,
  setIndex: number,
): Promise<ActiveSession> {
  const ctx = await requireActiveSession(db, userId, sessionId);
  await db
    .delete(workoutSets)
    .where(
      and(
        eq(workoutSets.sessionId, sessionId),
        eq(workoutSets.exerciseId, exerciseId),
        eq(workoutSets.setIndex, setIndex),
      ),
    );
  return buildSession(db, userId, ctx);
}

export async function upsertCardio(
  db: Db,
  userId: string,
  sessionId: string,
  exerciseId: string,
  entry: CardioEntry,
): Promise<ActiveSession> {
  const ctx = await requireKind(db, userId, sessionId, exerciseId, "cardio");
  const opt = (v: number | undefined) => (v === undefined ? null : String(v));
  const values = {
    durationMin: entry.durationMin,
    distanceKm: opt(entry.distanceKm),
    inclinePct: opt(entry.inclinePct),
    speedKmh: opt(entry.speedKmh),
    level: entry.level ?? null,
    completedAt: new Date(),
  };
  await db
    .insert(cardioEntries)
    .values({ sessionId, exerciseId, entryIndex: entry.entryIndex, ...values })
    .onConflictDoUpdate({
      target: [
        cardioEntries.sessionId,
        cardioEntries.exerciseId,
        cardioEntries.entryIndex,
      ],
      set: values,
    });
  return buildSession(db, userId, ctx);
}

export async function deleteCardio(
  db: Db,
  userId: string,
  sessionId: string,
  exerciseId: string,
  entryIndex: number,
): Promise<ActiveSession> {
  const ctx = await requireActiveSession(db, userId, sessionId);
  await db
    .delete(cardioEntries)
    .where(
      and(
        eq(cardioEntries.sessionId, sessionId),
        eq(cardioEntries.exerciseId, exerciseId),
        eq(cardioEntries.entryIndex, entryIndex),
      ),
    );
  return buildSession(db, userId, ctx);
}

/** Deletes the user's in-progress session (items, sets and cardio cascade); finished or foreign sessions are `not_found`. */
export async function discardSession(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<void> {
  const rows = await db
    .delete(workoutSessions)
    .where(
      and(
        eq(workoutSessions.id, sessionId),
        eq(workoutSessions.userId, userId),
        isNull(workoutSessions.endedAt),
      ),
    )
    .returning({ id: workoutSessions.id });
  if (rows.length === 0) throw new WorkoutError("not_found");
}

// ---------- finishing and stats ----------

/** Throws `already_finished` if the session has ended, and `empty_session` (rolled back) when `requireContent` is set and nothing was recorded. `notified` is set by the caller. */
export async function finishSession(
  db: Db,
  userId: string,
  sessionId: string,
  opts: { requireContent?: boolean } = {},
): Promise<FinishSummary> {
  return db.transaction(async (tx) => {
    // Atomic claim: only one concurrent finish can flip ended_at.
    const claimed = await tx
      .update(workoutSessions)
      .set({ endedAt: new Date() })
      .where(
        and(
          eq(workoutSessions.id, sessionId),
          eq(workoutSessions.userId, userId),
          isNull(workoutSessions.endedAt),
        ),
      )
      .returning({ id: workoutSessions.id });
    if (claimed.length === 0) {
      await requireSession(tx, userId, sessionId); // not_found if foreign
      throw new WorkoutError("already_finished");
    }

    const mine = await tx
      .select({ set: workoutSets, ex: exercises })
      .from(workoutSets)
      .innerJoin(exercises, eq(exercises.id, workoutSets.exerciseId))
      .where(
        and(
          eq(workoutSets.sessionId, sessionId),
          eq(exercises.kind, "strength"),
        ),
      )
      .orderBy(asc(workoutSets.exerciseId), asc(workoutSets.setIndex));
    const cardio = await tx
      .select()
      .from(cardioEntries)
      .where(eq(cardioEntries.sessionId, sessionId));

    const byExercise = new Map<
      string,
      { ex: ExerciseRow; sets: { weightKg: number; reps: number }[] }
    >();
    for (const { set, ex } of mine) {
      const entry = byExercise.get(ex.id) ?? { ex, sets: [] };
      entry.sets.push({ weightKg: Number(set.weightKg), reps: set.reps });
      byExercise.set(ex.id, entry);
    }

    const prs: FinishSummary["prs"] = [];
    for (const [exerciseId, { ex, sets }] of byExercise) {
      const best = bestE1RM(sets);
      if (best === null) continue;
      const prior = await tx
        .select({ weightKg: workoutSets.weightKg, reps: workoutSets.reps })
        .from(workoutSets)
        .innerJoin(
          workoutSessions,
          eq(workoutSessions.id, workoutSets.sessionId),
        )
        .where(
          and(
            eq(workoutSessions.userId, userId),
            isNotNull(workoutSessions.endedAt),
            ne(workoutSessions.id, sessionId),
            eq(workoutSets.exerciseId, exerciseId),
          ),
        );
      const priorBest = bestE1RM(
        prior.map((p) => ({ weightKg: Number(p.weightKg), reps: p.reps })),
      );
      if (priorBest === null || best <= priorBest) continue;
      const top = sets.find((s) => estimate1RM(s.weightKg, s.reps) === best);
      if (!top) continue;
      prs.push({
        exerciseId,
        nameZh: ex.nameZh,
        nameEn: ex.nameEn,
        e1rm: best,
        weightKg: top.weightKg,
        reps: top.reps,
      });
    }

    if (opts.requireContent && mine.length === 0 && cardio.length === 0) {
      // Rolls back the claim above, so the session stays in progress.
      throw new WorkoutError("empty_session");
    }

    const restSecs = mine.flatMap(({ set }) =>
      set.restSec === null ? [] : [set.restSec],
    );
    const touched = new Set([
      ...byExercise.keys(),
      ...cardio.map((c) => c.exerciseId),
    ]);
    return {
      sessionId,
      volumeKg: volume(
        mine.map((m) => ({
          weightKg: Number(m.set.weightKg),
          reps: m.set.reps,
        })),
      ),
      exerciseCount: touched.size,
      setCount: mine.length,
      cardioMinutes: cardio.reduce((sum, c) => sum + c.durationMin, 0),
      avgRestSec:
        restSecs.length === 0
          ? null
          : Math.round(restSecs.reduce((a, b) => a + b, 0) / restSecs.length),
      prs,
      notified: false,
    };
  });
}

/** Finished sessions with `performed_on` in [from, to], inclusive. */
export async function weekStats(
  db: Db,
  userId: string,
  from: string,
  to: string,
): Promise<WeekStats> {
  const inRange = and(
    eq(workoutSessions.userId, userId),
    isNotNull(workoutSessions.endedAt),
    gte(workoutSessions.performedOn, from),
    lte(workoutSessions.performedOn, to),
  );
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(workoutSessions)
    .where(inRange);
  const muscleRows = await db
    .select({
      muscle: exercises.muscleGroup,
      n: sql<number>`count(*)::int`,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSessions.id, workoutSets.sessionId))
    .innerJoin(exercises, eq(exercises.id, workoutSets.exerciseId))
    .where(and(inRange, eq(exercises.kind, "strength")))
    .groupBy(exercises.muscleGroup);
  const [{ minutes } = { minutes: 0 }] = await db
    .select({
      minutes: sql<number>`coalesce(sum(${cardioEntries.durationMin}), 0)::int`,
    })
    .from(cardioEntries)
    .innerJoin(workoutSessions, eq(workoutSessions.id, cardioEntries.sessionId))
    .where(inRange);

  const setsByMuscle = Object.fromEntries(
    MUSCLE_GROUPS.map((m) => [m, 0]),
  ) as Record<MuscleGroup, number>;
  for (const r of muscleRows) {
    if (r.muscle) setsByMuscle[r.muscle as MuscleGroup] = r.n;
  }
  return { from, to, sessions: n, setsByMuscle, cardioMinutes: minutes };
}

/** Name of the template a session was started from, or null. */
export async function sessionTemplateName(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ name: workoutTemplates.name })
    .from(workoutSessions)
    .leftJoin(
      workoutTemplates,
      eq(workoutTemplates.id, workoutSessions.templateId),
    )
    .where(
      and(
        eq(workoutSessions.id, sessionId),
        eq(workoutSessions.userId, userId),
      ),
    );
  return row?.name ?? null;
}

/** Records that the finish push went out, so it is not sent twice. */
export async function markNotified(db: Db, sessionId: string): Promise<void> {
  await db
    .update(workoutSessions)
    .set({ notifiedAt: new Date() })
    .where(eq(workoutSessions.id, sessionId));
}

export interface TodayWorkoutSummary {
  sessions: number;
  templateName: string | null;
  exerciseCount: number;
  setCount: number;
  volumeKg: number;
  cardioMinutes: number;
}

/** Totals over today's finished sessions, or null when there are none. */
export async function todayWorkoutSummary(
  db: Db,
  userId: string,
  today: string,
): Promise<TodayWorkoutSummary | null> {
  const sessions = await db
    .select({
      id: workoutSessions.id,
      templateName: workoutTemplates.name,
    })
    .from(workoutSessions)
    .leftJoin(
      workoutTemplates,
      eq(workoutTemplates.id, workoutSessions.templateId),
    )
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.performedOn, today),
        isNotNull(workoutSessions.endedAt),
      ),
    )
    .orderBy(desc(workoutSessions.endedAt));
  if (sessions.length === 0) return null;
  const ids = sessions.map((s) => s.id);
  const sets = await db
    .select({
      exerciseId: workoutSets.exerciseId,
      weightKg: workoutSets.weightKg,
      reps: workoutSets.reps,
    })
    .from(workoutSets)
    .innerJoin(exercises, eq(exercises.id, workoutSets.exerciseId))
    .where(
      and(inArray(workoutSets.sessionId, ids), eq(exercises.kind, "strength")),
    );
  const cardio = await db
    .select({
      exerciseId: cardioEntries.exerciseId,
      d: cardioEntries.durationMin,
    })
    .from(cardioEntries)
    .where(inArray(cardioEntries.sessionId, ids));
  const names = new Set(sessions.map((s) => s.templateName));
  return {
    sessions: sessions.length,
    // Latest session's template, or null when the day mixed templates.
    templateName: names.size === 1 ? (sessions[0]?.templateName ?? null) : null,
    exerciseCount: new Set([
      ...sets.map((s) => s.exerciseId),
      ...cardio.map((c) => c.exerciseId),
    ]).size,
    setCount: sets.length,
    volumeKg: volume(
      sets.map((s) => ({ weightKg: Number(s.weightKg), reps: s.reps })),
    ),
    cardioMinutes: cardio.reduce((sum, c) => sum + c.d, 0),
  };
}
