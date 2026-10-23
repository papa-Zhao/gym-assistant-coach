import type { RateLimitPluginOptions } from "@fastify/rate-limit";
import type { FastifyRequest } from "fastify";
import { verifySession } from "./auth/session.js";
import { extractBearer } from "./http.js";

export const RATE_LIMIT_USER_MAX = 120;
export const RATE_LIMIT_IP_MAX = 30;
export const RATE_LIMIT_WINDOW_MS = 60_000;

// Health checks, the bot (limited per LINE user on its side) and Cloud
// Scheduler jobs are never limited here.
function allowed(req: FastifyRequest): boolean {
  const url = req.routeOptions.url ?? "";
  return (
    url === "/health" ||
    url.startsWith("/internal/") ||
    url.startsWith("/jobs/")
  );
}

/**
 * In-memory limits per Cloud Run instance. A valid session counts against its
 * user; anything else (no token, bad or expired token) against the client IP,
 * so fake tokens cannot buy extra quota. `req.ip` is the last
 * X-Forwarded-For hop (trustProxy: 1), which Cloud Run appends itself.
 */
export function rateLimitOptions(
  sessionSecret: Uint8Array,
): RateLimitPluginOptions {
  return {
    timeWindow: RATE_LIMIT_WINDOW_MS,
    max: (_req, key) =>
      key.startsWith("u:") ? RATE_LIMIT_USER_MAX : RATE_LIMIT_IP_MAX,
    keyGenerator: async (req) => {
      const token = extractBearer(req);
      if (token) {
        try {
          return `u:${(await verifySession(sessionSecret, token)).userId}`;
        } catch {
          // Fall through to the IP key.
        }
      }
      return `ip:${req.ip}`;
    },
    allowList: (req) => allowed(req),
    // Never log the key itself: it is a user id or an IP.
    onExceeded: (req, key) => {
      req.log.info(
        {
          route: req.routeOptions.url,
          keyKind: key.startsWith("u:") ? "user" : "ip",
        },
        "rate limited",
      );
    },
  };
}
