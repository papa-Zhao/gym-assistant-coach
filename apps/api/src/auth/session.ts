import { eq } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { users } from "../db/schema";
import type { Db } from "../users/repo";

export const SESSION_TTL_SECONDS = 3600;

export async function issueSession(
  secret: Uint8Array,
  userId: string,
  now: Date = new Date(),
): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_TTL_SECONDS)
    .sign(secret);
}

export async function verifySession(
  secret: Uint8Array,
  token: string,
): Promise<{ userId: string }> {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
  });
  if (!payload.sub) throw new Error("session has no subject");
  return { userId: payload.sub };
}

/** verifySession plus a check that the user exists and is not deleted; rejects otherwise. */
export async function verifyActiveSession(
  db: Db,
  secret: Uint8Array,
  token: string,
): Promise<{ userId: string }> {
  const session = await verifySession(secret, token);
  // A token outlives a deletion by up to SESSION_TTL_SECONDS; check every time.
  const [row] = await db
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, session.userId));
  if (!row || row.status === "deleted") throw new Error("inactive session");
  return session;
}
