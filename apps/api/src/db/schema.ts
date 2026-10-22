import {
  CONSENT_DOCS,
  EQUIPMENT,
  EXERCISE_KINDS,
  FOOD_SOURCES,
  MEAL_SOURCES,
  MEAL_STATUSES,
  MEAL_TYPES,
  MUSCLE_GROUPS,
} from "@gac/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lineUserId: text("line_user_id").notNull().unique(),
    displayName: text("display_name"),
    role: text("role").notNull().default("user"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    check("users_role_check", sql`${t.role} in ('user', 'coach', 'admin')`),
    check(
      "users_status_check",
      sql`${t.status} in ('active', 'unfollowed', 'deleted')`,
    ),
  ],
);

export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    doc: text("doc").notNull(),
    version: text("version").notNull(),
    agreedAt: timestamp("agreed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("consents_user_doc_version_unique").on(t.userId, t.doc, t.version),
    check(
      "consents_doc_check",
      sql.raw(`"doc" in (${CONSENT_DOCS.map((d) => `'${d}'`).join(", ")})`),
    ),
  ],
);

export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    sex: text("sex").notNull(),
    birthYear: integer("birth_year").notNull(),
    heightCm: numeric("height_cm", { precision: 5, scale: 1 }).notNull(),
    activityLevel: text("activity_level").notNull(),
    goal: text("goal").notNull(),
    targetKcal: integer("target_kcal").notNull(),
    targetProteinG: integer("target_protein_g").notNull(),
    targetCarbG: integer("target_carb_g").notNull(),
    targetFatG: integer("target_fat_g").notNull(),
    targetsOverridden: boolean("targets_overridden").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("user_profiles_sex_check", sql`${t.sex} in ('male', 'female')`),
    check(
      "user_profiles_activity_level_check",
      sql`${t.activityLevel} in ('sedentary', 'light', 'moderate', 'active', 'very_active')`,
    ),
    check(
      "user_profiles_goal_check",
      sql`${t.goal} in ('cut', 'maintain', 'bulk')`,
    ),
  ],
);

export const bodyMetrics = pgTable(
  "body_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    measuredOn: date("measured_on").notNull(),
    weightKg: numeric("weight_kg", { precision: 5, scale: 1 }),
    bodyFatPct: numeric("body_fat_pct", { precision: 4, scale: 1 }),
    waistCm: numeric("waist_cm", { precision: 5, scale: 1 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("body_metrics_user_measured_on_unique").on(t.userId, t.measuredOn),
  ],
);

const inList = (values: readonly string[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(", "));

export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").unique(),
    nameZh: text("name_zh").notNull(),
    nameEn: text("name_en"),
    kind: text("kind").notNull(),
    muscleGroup: text("muscle_group"),
    equipment: text("equipment").notNull(),
    isCustom: boolean("is_custom").notNull().default(false),
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "exercises_kind_check",
      sql`${t.kind} in (${inList(EXERCISE_KINDS)})`,
    ),
    check(
      "exercises_muscle_group_check",
      sql`${t.muscleGroup} in (${inList(MUSCLE_GROUPS)})`,
    ),
    check(
      "exercises_equipment_check",
      sql`${t.equipment} in (${inList(EQUIPMENT)})`,
    ),
    check(
      "exercises_strength_muscle_check",
      sql`${t.kind} = 'cardio' or ${t.muscleGroup} is not null`,
    ),
    check(
      "exercises_custom_owner_check",
      sql`${t.isCustom} = (${t.ownerUserId} is not null)`,
    ),
    check(
      "exercises_builtin_names_check",
      sql`${t.isCustom} or (${t.slug} is not null and ${t.nameEn} is not null)`,
    ),
    uniqueIndex("exercises_builtin_name_zh_unique")
      .on(t.nameZh)
      .where(sql`not ${t.isCustom}`),
  ],
);

export const workoutTemplates = pgTable("workout_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const templateItems = pgTable(
  "template_items",
  {
    templateId: uuid("template_id")
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    position: integer("position").notNull(),
    sets: integer("sets").notNull(),
    reps: integer("reps").notNull(),
  },
  (t) => [primaryKey({ columns: [t.templateId, t.exerciseId] })],
);

export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    performedOn: date("performed_on").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    note: text("note"),
    templateId: uuid("template_id").references(() => workoutTemplates.id, {
      onDelete: "set null",
    }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("workout_sessions_one_active_unique")
      .on(t.userId)
      .where(sql`${t.endedAt} is null`),
  ],
);

export const workoutSessionItems = pgTable(
  "workout_session_items",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    position: integer("position").notNull(),
    targetSets: integer("target_sets"),
    targetReps: integer("target_reps"),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.exerciseId] })],
);

export const workoutSets = pgTable(
  "workout_sets",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    setIndex: integer("set_index").notNull(),
    reps: integer("reps").notNull(),
    weightKg: numeric("weight_kg", { precision: 5, scale: 1 }).notNull(),
    rpe: numeric("rpe", { precision: 3, scale: 1 }),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    restSec: integer("rest_sec"),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.exerciseId, t.setIndex] }),
    check("workout_sets_rest_sec_check", sql`${t.restSec} between 0 and 3600`),
  ],
);

export const cardioEntries = pgTable(
  "cardio_entries",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    entryIndex: integer("entry_index").notNull(),
    durationMin: integer("duration_min").notNull(),
    distanceKm: numeric("distance_km", { precision: 5, scale: 2 }),
    inclinePct: numeric("incline_pct", { precision: 3, scale: 1 }),
    speedKmh: numeric("speed_kmh", { precision: 3, scale: 1 }),
    level: integer("level"),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.exerciseId, t.entryIndex] })],
);

export const foods = pgTable(
  "foods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    sourceRef: text("source_ref"),
    name: text("name").notNull(),
    aliases: text("aliases"),
    category: text("category"),
    kcalPer100g: numeric("kcal_per_100g", { precision: 6, scale: 1 }).notNull(),
    proteinPer100g: numeric("protein_per_100g", { precision: 6, scale: 1 }),
    carbPer100g: numeric("carb_per_100g", { precision: 6, scale: 1 }),
    fatPer100g: numeric("fat_per_100g", { precision: 6, scale: 1 }),
    servingDesc: text("serving_desc"),
    ownerUserId: uuid("owner_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("foods_source_source_ref_unique").on(t.source, t.sourceRef),
    check("foods_source_check", sql`${t.source} in (${inList(FOOD_SOURCES)})`),
  ],
);

export const meals = pgTable(
  "meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    eatenOn: date("eaten_on").notNull(),
    mealType: text("meal_type").notNull(),
    status: text("status").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [
    index("meals_user_eaten_on_idx").on(t.userId, t.eatenOn),
    check(
      "meals_meal_type_check",
      sql`${t.mealType} in (${inList(MEAL_TYPES)})`,
    ),
    check("meals_status_check", sql`${t.status} in (${inList(MEAL_STATUSES)})`),
    check("meals_source_check", sql`${t.source} in (${inList(MEAL_SOURCES)})`),
  ],
);

export const mealItems = pgTable(
  "meal_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mealId: uuid("meal_id")
      .notNull()
      .references(() => meals.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    foodId: uuid("food_id").references(() => foods.id),
    name: text("name").notNull(),
    grams: numeric("grams", { precision: 6, scale: 1 }).notNull(),
    kcal: integer("kcal").notNull(),
    proteinG: numeric("protein_g", { precision: 6, scale: 1 }).notNull(),
    carbG: numeric("carb_g", { precision: 6, scale: 1 }).notNull(),
    fatG: numeric("fat_g", { precision: 6, scale: 1 }).notNull(),
    aiConfidence: numeric("ai_confidence", { precision: 3, scale: 2 }),
  },
  (t) => [unique("meal_items_meal_position_unique").on(t.mealId, t.position)],
);
