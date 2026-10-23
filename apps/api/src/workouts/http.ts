import type { ApiError } from "@gac/shared";
import type { FastifyReply } from "fastify";
import { bearerAuth } from "../http.js";
import { verifyActiveSession } from "../auth/session";
import type { Db } from "../users/repo";
import { WorkoutError } from "./repo";

declare module "fastify" {
  interface FastifyRequest {
    workoutUserId?: string;
  }
}

/** Session auth for the workout routes; stores the user id on the request. */
export const workoutAuth = (db: Db, sessionSecret: Uint8Array) =>
  bearerAuth(
    (token) => verifyActiveSession(db, sessionSecret, token),
    (req, { userId }) => {
      req.workoutUserId = userId;
    },
  );

/** Maps a typed WorkoutError to a fixed ApiError; rethrows anything else. */
export function sendWorkoutError(reply: FastifyReply, err: unknown) {
  if (!(err instanceof WorkoutError)) throw err;
  if (err.code === "not_found") {
    return reply.code(404).send({ error: "not_found" } satisfies ApiError);
  }
  if (err.code === "wrong_kind") return badRequest(reply);
  return reply.code(409).send({ error: "conflict" } satisfies ApiError);
}

export const badRequest = (reply: FastifyReply) =>
  reply.code(400).send({ error: "bad_request" } satisfies ApiError);
