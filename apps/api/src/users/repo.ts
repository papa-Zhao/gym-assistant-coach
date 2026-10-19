import {
  CONSENT_DOCS,
  CONSENT_VERSION,
  type SyncUserResponse,
} from "@gac/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { consents, users } from "../db/schema";

export type Db = PgDatabase<PgQueryResultHKT>;

export async function syncUser(
  db: Db,
  lineUserId: string,
  displayName: string | null,
): Promise<SyncUserResponse> {
  const [row] = await db
    .insert(users)
    .values({ lineUserId, displayName, status: "active" })
    .onConflictDoUpdate({
      target: users.lineUserId,
      set: {
        status: "active",
        displayName: sql`coalesce(excluded.display_name, ${users.displayName})`,
      },
    })
    .returning({ id: users.id });
  if (!row) throw new Error("syncUser: upsert returned no row");
  return { userId: row.id, consented: await hasCurrentConsent(db, row.id) };
}

export async function recordConsent(
  db: Db,
  lineUserId: string,
  version: string,
): Promise<void> {
  const user = await findByLineUserId(db, lineUserId);
  if (!user) throw new Error("recordConsent: unknown user");
  await db
    .insert(consents)
    .values(CONSENT_DOCS.map((doc) => ({ userId: user.id, doc, version })))
    .onConflictDoNothing();
}

export async function markUnfollowed(
  db: Db,
  lineUserId: string,
): Promise<void> {
  await db
    .update(users)
    .set({ status: "unfollowed" })
    .where(eq(users.lineUserId, lineUserId));
}

export async function findByLineUserId(
  db: Db,
  lineUserId: string,
): Promise<{ id: string; displayName: string | null; status: string } | null> {
  const [row] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      status: users.status,
    })
    .from(users)
    .where(eq(users.lineUserId, lineUserId));
  return row ?? null;
}

export async function hasCurrentConsent(
  db: Db,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ doc: consents.doc })
    .from(consents)
    .where(
      and(
        eq(consents.userId, userId),
        eq(consents.version, CONSENT_VERSION),
        inArray(consents.doc, [...CONSENT_DOCS]),
      ),
    );
  return new Set(rows.map((r) => r.doc)).size === CONSENT_DOCS.length;
}

export async function updateDisplayName(
  db: Db,
  userId: string,
  name: string,
): Promise<void> {
  await db.update(users).set({ displayName: name }).where(eq(users.id, userId));
}

export async function findById(
  db: Db,
  userId: string,
): Promise<{ id: string; displayName: string | null } | null> {
  const [row] = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId));
  return row ?? null;
}

/** The LINE user id for an internal user id, or null. */
export async function findLineUserId(
  db: Db,
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ lineUserId: users.lineUserId })
    .from(users)
    .where(eq(users.id, userId));
  return row?.lineUserId ?? null;
}
