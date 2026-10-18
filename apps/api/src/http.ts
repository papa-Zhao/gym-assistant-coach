import type { ApiError } from "@gac/shared";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export function extractBearer(req: FastifyRequest): string | null {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
  return match?.[1] ?? null;
}

/**
 * onRequest hook: replies 401 unless `verify` resolves for the bearer token.
 * `verify` must reject to deny access (including on a failed identity check).
 */
export function bearerAuth<T>(
  verify: (token: string) => Promise<T>,
  onOk: (req: FastifyRequest, value: T) => void = () => {},
) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const unauthorized = () =>
      reply.code(401).send({ error: "unauthorized" } satisfies ApiError);
    const token = extractBearer(req);
    if (!token) return unauthorized();
    try {
      onOk(req, await verify(token));
    } catch {
      return unauthorized();
    }
  };
}

/** Maps schema validation failures to 400 bad_request; rethrows the rest. */
export function apiErrorHandler(
  err: FastifyError,
  _req: FastifyRequest,
  reply: FastifyReply,
) {
  if (err.validation) {
    return reply.code(400).send({ error: "bad_request" } satisfies ApiError);
  }
  throw err;
}
