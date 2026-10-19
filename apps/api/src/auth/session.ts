import { jwtVerify, SignJWT } from "jose";

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
