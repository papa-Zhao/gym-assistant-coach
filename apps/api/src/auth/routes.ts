import type { ApiError, LiffAuthResponse, MeResponse } from "@gac/shared";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
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

    app.setErrorHandler((err, _req, reply) => {
      if ((err as { validation?: unknown }).validation) {
        return reply
          .code(400)
          .send({ error: "bad_request" } satisfies ApiError);
      }
      throw err;
    });

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

    const authenticate = async (req: FastifyRequest, reply: FastifyReply) => {
      const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
      const unauthorized = () =>
        reply.code(401).send({ error: "unauthorized" } satisfies ApiError);
      if (!match?.[1]) return unauthorized();
      try {
        req.sessionUserId = (
          await verifySession(sessionSecret, match[1])
        ).userId;
      } catch {
        return unauthorized();
      }
    };

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
