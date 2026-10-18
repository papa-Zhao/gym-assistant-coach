import type { FastifyPluginAsync } from "fastify";
import { apiErrorHandler, bearerAuth } from "../http.js";
import type { AppDeps } from "../deps.js";
import { markUnfollowed, recordConsent, syncUser } from "../users/repo";

const lineUserId = { type: "string", pattern: "^U[0-9a-f]{32}$" } as const;

const syncSchema = {
  body: {
    type: "object",
    required: ["lineUserId"],
    additionalProperties: false,
    properties: {
      lineUserId,
      displayName: { type: ["string", "null"], maxLength: 200 },
    },
  },
} as const;

const consentSchema = {
  body: {
    type: "object",
    required: ["lineUserId", "version"],
    additionalProperties: false,
    properties: { lineUserId, version: { type: "string", maxLength: 32 } },
  },
} as const;

const unfollowSchema = {
  body: {
    type: "object",
    required: ["lineUserId"],
    additionalProperties: false,
    properties: { lineUserId },
  },
} as const;

export const internalRoutes =
  (deps: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const { db, verifyServiceToken, botServiceAccount } = deps;

    app.addHook(
      "onRequest",
      bearerAuth(async (token) => {
        const { email } = await verifyServiceToken(token);
        if (email !== botServiceAccount) throw new Error("wrong service");
      }),
    );

    app.setErrorHandler(apiErrorHandler);

    app.post<{ Body: { lineUserId: string; displayName?: string | null } }>(
      "/users/sync",
      { schema: syncSchema },
      async (req) =>
        syncUser(db, req.body.lineUserId, req.body.displayName ?? null),
    );

    app.post<{ Body: { lineUserId: string; version: string } }>(
      "/users/consent",
      { schema: consentSchema },
      async (req, reply) => {
        // A postback may arrive from a user the api has never seen.
        await syncUser(db, req.body.lineUserId, null);
        await recordConsent(db, req.body.lineUserId, req.body.version);
        return reply.code(204).send();
      },
    );

    app.post<{ Body: { lineUserId: string } }>(
      "/users/unfollow",
      { schema: unfollowSchema },
      async (req, reply) => {
        await markUnfollowed(db, req.body.lineUserId);
        return reply.code(204).send();
      },
    );
  };
