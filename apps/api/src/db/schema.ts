import { CONSENT_DOCS } from "@gac/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
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
