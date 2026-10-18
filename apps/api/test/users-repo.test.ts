import { CONSENT_VERSION } from "@gac/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  findByLineUserId,
  hasCurrentConsent,
  markUnfollowed,
  recordConsent,
  syncUser,
  updateDisplayName,
} from "../src/users/repo";
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
