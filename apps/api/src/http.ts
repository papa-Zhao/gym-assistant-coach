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

/**
 * Maps errors to fixed, content-free API bodies. Validation and other 4xx
 * errors become 400 bad_request; anything else is a 500 "internal". The 5xx
 * path logs only the error name/code: DB driver messages embed SQL text and
 * params (LINE userIds), which must reach neither the client nor the logs.
 */
export function apiErrorHandler(
  err: FastifyError,
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const status = err.statusCode;
  if (
    err.validation ||
    (status !== undefined && status >= 400 && status < 500)
  ) {
    return reply.code(400).send({ error: "bad_request" } satisfies ApiError);
  }
  req.log.error(
    { err: { name: err.name, code: err.code } },
    "request failed with an internal error",
  );
  return reply.code(500).send({ error: "internal" } satisfies ApiError);
}
