import { CONSENT_VERSION } from "@gac/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  findByLineUserId,
  hasCurrentConsent,
  markUnfollowed,
  recordConsent,
  requestAccountDeletion,
  syncUser,
  updateDisplayName,
} from "../src/users/repo";
import { users } from "../src/db/schema";
import { createTestDb } from "./db";

describe("users repo", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function newDb() {
    const t = await createTestDb();
    close = t.close;
    return t.db;
  }

  it("syncUser creates a user once", async () => {
    const db = await newDb();
    const a = await syncUser(db, "U1", "Amy");
    const b = await syncUser(db, "U1", "Amy");
    expect(b.userId).toBe(a.userId);
    expect(a.consented).toBe(false);
  });

  it("syncUser updates display name but keeps it when null", async () => {
    const db = await newDb();
    await syncUser(db, "U1", "Amy");
    await syncUser(db, "U1", "Amy2");
    expect((await findByLineUserId(db, "U1"))?.displayName).toBe("Amy2");
    await syncUser(db, "U1", null);
    expect((await findByLineUserId(db, "U1"))?.displayName).toBe("Amy2");
  });

  it("recordConsent makes hasCurrentConsent true and is idempotent", async () => {
    const db = await newDb();
    const { userId } = await syncUser(db, "U1", "Amy");
    await recordConsent(db, "U1", CONSENT_VERSION);
    await recordConsent(db, "U1", CONSENT_VERSION);
    expect(await hasCurrentConsent(db, userId)).toBe(true);
    expect((await syncUser(db, "U1", null)).consented).toBe(true);
  });

  it("older consent version does not count", async () => {
    const db = await newDb();
    const { userId } = await syncUser(db, "U1", "Amy");
    await recordConsent(db, "U1", "2020-01-01");
    expect(await hasCurrentConsent(db, userId)).toBe(false);
  });

  it("refollow after unfollow restores active and keeps consent", async () => {
    const db = await newDb();
    await syncUser(db, "U1", "Amy");
    await recordConsent(db, "U1", CONSENT_VERSION);
    await markUnfollowed(db, "U1");
    expect((await findByLineUserId(db, "U1"))?.status).toBe("unfollowed");
    const again = await syncUser(db, "U1", null);
    expect((await findByLineUserId(db, "U1"))?.status).toBe("active");
    expect(again.consented).toBe(true);
  });
});

describe("updateDisplayName", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it("changes the name without touching status", async () => {
    const t = await createTestDb();
    close = t.close;
    const { userId } = await syncUser(t.db, "U9", "Old");
    await markUnfollowed(t.db, "U9");
    await updateDisplayName(t.db, userId, "New");
    expect(await findByLineUserId(t.db, "U9")).toEqual({
      id: userId,
      displayName: "New",
      status: "unfollowed",
    });
  });
});

describe("requestAccountDeletion", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  const T1 = new Date("2026-10-20T01:00:00Z");
  const T2 = new Date("2026-10-21T01:00:00Z");

  async function setup() {
    const t = await createTestDb();
    close = t.close;
    const { userId } = await syncUser(t.db, "U1", "Amy");
    await recordConsent(t.db, "U1", CONSENT_VERSION);
    const row = async (id: string) =>
      (await t.db.select().from(users).where(eq(users.id, id)))[0];
    return { db: t.db, userId, row };
  }

  it("marks the account deleted and frees the LINE id; idempotent", async () => {
    const { db, userId, row } = await setup();
    await requestAccountDeletion(db, userId, T1);
    expect(await row(userId)).toMatchObject({
      status: "deleted",
      deletedAt: T1,
      lineUserId: `deleted:${userId}`,
    });
    await requestAccountDeletion(db, userId, T2);
    expect((await row(userId))?.deletedAt).toEqual(T1);
  });

  it("the same LINE id comes back as a new, unconsented user", async () => {
    const { db, userId, row } = await setup();
    await requestAccountDeletion(db, userId, T1);
    const again = await syncUser(db, "U1", "Amy");
    expect(again.userId).not.toBe(userId);
    expect(again.consented).toBe(false);
    expect((await row(userId))?.status).toBe("deleted");
  });

  it("markUnfollowed with the old LINE id leaves the deleted account alone", async () => {
    const { db, userId, row } = await setup();
    await requestAccountDeletion(db, userId, T1);
    await markUnfollowed(db, "U1");
    expect((await row(userId))?.status).toBe("deleted");
  });
});
