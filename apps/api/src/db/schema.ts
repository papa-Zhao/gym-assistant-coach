import { CONSENT_DOCS } from "@gac/shared";
import { sql } from "drizzle-orm";
import {
  check,
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
