import type { ApiError, LiffAuthResponse, MeResponse } from "@gac/shared";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { apiErrorHandler, bearerAuth } from "../http.js";
import type { AppDeps } from "../deps.js";
import {
  findById,
  findByLineUserId,
  hasCurrentConsent,
  updateDisplayName,
} from "../users/repo";
import { issueSession, SESSION_TTL_SECONDS, verifySession } from "./session";

const liffSchema = {
  body: {
    type: "object",
    required: ["idToken"],
    additionalProperties: false,
    properties: { idToken: { type: "string", minLength: 1, maxLength: 4096 } },
  },
} as const;

declare module "fastify" {
  interface FastifyRequest {
    sessionUserId?: string;
  }
}

export const authRoutes =
  (deps: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const { db, verifyLineIdToken, sessionSecret } = deps;

    app.setErrorHandler(apiErrorHandler);

    app.post<{ Body: { idToken: string } }>(
      "/auth/liff",
      { schema: liffSchema },
      async (req, reply) => {
        let profile;
        try {
          profile = await verifyLineIdToken(req.body.idToken);
        } catch {
          return reply
            .code(401)
            .send({ error: "unauthorized" } satisfies ApiError);
        }
        const user = await findByLineUserId(db, profile.sub);
        if (!user || !(await hasCurrentConsent(db, user.id))) {
          return reply
            .code(403)
            .send({ error: "consent_required" } satisfies ApiError);
        }
        if (profile.name !== null) {
          await updateDisplayName(db, user.id, profile.name);
        }
        const accessToken = await issueSession(sessionSecret, user.id);
        return {
          accessToken,
          expiresIn: SESSION_TTL_SECONDS,
          displayName: profile.name ?? user.displayName ?? "",
        } satisfies LiffAuthResponse;
      },
    );

    const authenticate = bearerAuth(
      (token) => verifySession(sessionSecret, token),
      (req, { userId }) => {
        req.sessionUserId = userId;
      },
    );

    app.get(
      "/me",
      { onRequest: authenticate },
      async (req, reply): Promise<MeResponse | FastifyReply> => {
        const user = req.sessionUserId
          ? await findById(db, req.sessionUserId)
          : null;
        if (!user) {
          return reply
            .code(401)
            .send({ error: "unauthorized" } satisfies ApiError);
        }
        return { displayName: user.displayName ?? "" };
      },
    );
  };
