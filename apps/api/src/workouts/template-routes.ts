import type { Template } from "@gac/shared";
import type { FastifyPluginAsync } from "fastify";
import { apiErrorHandler } from "../http.js";
import type { AppDeps } from "../deps.js";
import {
  createTemplateFromSession,
  deleteTemplate,
  listTemplates,
} from "./repo";
import { badRequest, sendWorkoutError, workoutAuth } from "./http";

const createSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["fromSessionId", "name"],
    properties: {
      fromSessionId: { type: "string", format: "uuid" },
      name: { type: "string", minLength: 1, maxLength: 30 },
    },
  },
} as const;

const idSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string", format: "uuid" } },
  },
} as const;

export const templateRoutes =
  (deps: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const { db, sessionSecret } = deps;
    app.setErrorHandler(apiErrorHandler);
    const authenticate = workoutAuth(sessionSecret);

    app.get(
      "/templates",
      { onRequest: authenticate },
      async (req): Promise<Template[]> =>
        listTemplates(db, req.workoutUserId as string),
    );

    app.post<{ Body: { fromSessionId: string; name: string } }>(
      "/templates",
      { onRequest: authenticate, schema: createSchema },
      async (req, reply) => {
        const name = req.body.name.trim();
        if (name.length < 1) return badRequest(reply);
        try {
          const created = await createTemplateFromSession(
            db,
            req.workoutUserId as string,
            req.body.fromSessionId,
            name,
            { requireFinished: true },
          );
          return reply.code(201).send(created);
        } catch (err) {
          return sendWorkoutError(reply, err);
        }
      },
    );

    app.delete<{ Params: { id: string } }>(
      "/templates/:id",
      { onRequest: authenticate, schema: idSchema },
      async (req, reply) => {
        try {
          await deleteTemplate(db, req.workoutUserId as string, req.params.id);
        } catch (err) {
          return sendWorkoutError(reply, err);
        }
        return reply.code(204).send();
      },
    );
  };
