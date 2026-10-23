import {
  CARDIO_LIMITS,
  SET_LIMITS,
  taipeiDate,
  weekRange,
  type ActiveSession,
  type ApiError,
  type FinishSummary,
  type WeekStats,
} from "@gac/shared";
import type { FastifyPluginAsync } from "fastify";
import { apiErrorHandler } from "../http.js";
import type { AppDeps } from "../deps.js";
import { findLineUserId } from "../users/repo";
import {
  addItem,
  deleteCardio,
  deleteSet,
  discardSession,
  removeItem,
  finishSession,
  getActiveSession,
  markNotified,
  sessionTemplateName,
  startSession,
  upsertCardio,
  upsertSet,
  weekStats,
} from "./repo";
import { WorkoutError } from "./repo";
import { badRequest, sendWorkoutError, workoutAuth } from "./http";

const DEFAULT_NOTIFY_TIMEOUT_MS = 5000;

const uuid = { type: "string", format: "uuid" } as const;
const index = { type: "integer", minimum: 1, maximum: 1000 } as const;

const range = (r: { min: number; max: number }, type = "number") =>
  ({ type, minimum: r.min, maximum: r.max }) as const;

const startSchema = {
  body: {
    type: ["object", "null"],
    additionalProperties: false,
    properties: { templateId: uuid },
  },
} as const;

const idSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: uuid },
  },
} as const;

const itemSchema = {
  ...idSchema,
  body: {
    type: "object",
    additionalProperties: false,
    required: ["exerciseId"],
    properties: { exerciseId: uuid },
  },
} as const;

const removeItemSchema = {
  params: {
    type: "object",
    required: ["id", "exerciseId"],
    properties: { id: uuid, exerciseId: uuid },
  },
} as const;

const setSchema = {
  ...idSchema,
  body: {
    type: "object",
    additionalProperties: false,
    required: ["exerciseId", "setIndex", "reps", "weightKg"],
    properties: {
      exerciseId: uuid,
      setIndex: index,
      reps: range(SET_LIMITS.reps, "integer"),
      weightKg: range(SET_LIMITS.weightKg),
      rpe: range(SET_LIMITS.rpe),
      restSec: range(SET_LIMITS.restSec, "integer"),
    },
  },
} as const;

const cardioSchema = {
  ...idSchema,
  body: {
    type: "object",
    additionalProperties: false,
    required: ["exerciseId", "entryIndex", "durationMin"],
    properties: {
      exerciseId: uuid,
      entryIndex: index,
      durationMin: range(CARDIO_LIMITS.durationMin, "integer"),
      distanceKm: range(CARDIO_LIMITS.distanceKm),
      inclinePct: range(CARDIO_LIMITS.inclinePct),
      speedKmh: range(CARDIO_LIMITS.speedKmh),
      level: range(CARDIO_LIMITS.level, "integer"),
    },
  },
} as const;

const deleteSetSchema = {
  params: {
    type: "object",
    required: ["id", "exerciseId", "setIndex"],
    properties: { id: uuid, exerciseId: uuid, setIndex: index },
  },
} as const;

const deleteCardioSchema = {
  params: {
    type: "object",
    required: ["id", "exerciseId", "entryIndex"],
    properties: { id: uuid, exerciseId: uuid, entryIndex: index },
  },
} as const;

/** True when `v` has at most `places` decimal places. */
const hasPlaces = (v: number, places: number): boolean => {
  const f = 10 ** places;
  return Math.round(v * f) / f === v;
};

const isHalfStep = (v: number): boolean => Number.isInteger(v * 2);

/** A rejecting timer whose handle the caller clears once the race is over. */
const deadline = (ms: number) => {
  let handle: NodeJS.Timeout | undefined;
  const promise = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(new Error("timeout")), ms);
  });
  // Never an unhandled rejection, even if nothing awaits the promise in time.
  promise.catch(() => {});
  return { promise, clear: () => clearTimeout(handle) };
};

export const sessionRoutes =
  (deps: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const { db, sessionSecret, now, notifyWorkoutFinished } = deps;
    const notifyTimeoutMs = deps.notifyTimeoutMs ?? DEFAULT_NOTIFY_TIMEOUT_MS;
    app.setErrorHandler(apiErrorHandler);
    const authenticate = workoutAuth(db, sessionSecret);
    const auth = { onRequest: authenticate };
    const uid = (req: { workoutUserId?: string }) =>
      req.workoutUserId as string;

    app.get(
      "/workouts/active",
      auth,
      async (req): Promise<ActiveSession | null> =>
        getActiveSession(db, uid(req), taipeiDate(now())),
    );

    app.get("/workouts/week", auth, async (req): Promise<WeekStats> => {
      const { from, to } = weekRange(taipeiDate(now()));
      return weekStats(db, uid(req), from, to);
    });

    app.post<{ Body: { templateId?: string } | null }>(
      "/workouts",
      { ...auth, schema: startSchema },
      async (req, reply) => {
        try {
          return await startSession(
            db,
            uid(req),
            taipeiDate(now()),
            req.body?.templateId,
          );
        } catch (err) {
          return sendWorkoutError(reply, err);
        }
      },
    );

    app.post<{ Params: { id: string }; Body: { exerciseId: string } }>(
      "/workouts/:id/items",
      { ...auth, schema: itemSchema },
      async (req, reply) => {
        try {
          return await addItem(
            db,
            uid(req),
            req.params.id,
            req.body.exerciseId,
          );
        } catch (err) {
          return sendWorkoutError(reply, err);
        }
      },
    );

    app.delete<{ Params: { id: string; exerciseId: string } }>(
      "/workouts/:id/items/:exerciseId",
      { ...auth, schema: removeItemSchema },
      async (req, reply) => {
        try {
          return await removeItem(
            db,
            uid(req),
            req.params.id,
            req.params.exerciseId,
          );
        } catch (err) {
          // A finished session is as good as gone for this route.
          if (err instanceof WorkoutError && err.code === "session_finished") {
            return reply
              .code(404)
              .send({ error: "not_found" } satisfies ApiError);
          }
          return sendWorkoutError(reply, err);
        }
      },
    );

    app.put<{
      Params: { id: string };
      Body: {
        exerciseId: string;
        setIndex: number;
        reps: number;
        weightKg: number;
        rpe?: number;
        restSec?: number;
      };
    }>(
      "/workouts/:id/sets",
      { ...auth, schema: setSchema },
      async (req, reply) => {
        const { exerciseId, setIndex, reps, weightKg, rpe, restSec } = req.body;
        if (
          !hasPlaces(weightKg, 1) ||
          (rpe !== undefined && !isHalfStep(rpe))
        ) {
          return badRequest(reply);
        }
        try {
          return await upsertSet(db, uid(req), req.params.id, exerciseId, {
            setIndex,
            reps,
            weightKg,
            ...(rpe === undefined ? {} : { rpe }),
            ...(restSec === undefined ? {} : { restSec }),
          });
        } catch (err) {
          return sendWorkoutError(reply, err);
        }
      },
    );

    app.delete<{
      Params: { id: string; exerciseId: string; setIndex: number };
    }>(
      "/workouts/:id/sets/:exerciseId/:setIndex",
      { ...auth, schema: deleteSetSchema },
      async (req, reply) => {
        try {
          return await deleteSet(
            db,
            uid(req),
            req.params.id,
            req.params.exerciseId,
            req.params.setIndex,
          );
        } catch (err) {
          return sendWorkoutError(reply, err);
        }
      },
    );

    app.put<{
      Params: { id: string };
      Body: {
        exerciseId: string;
        entryIndex: number;
        durationMin: number;
        distanceKm?: number;
        inclinePct?: number;
        speedKmh?: number;
        level?: number;
      };
    }>(
      "/workouts/:id/cardio",
      { ...auth, schema: cardioSchema },
      async (req, reply) => {
        const { exerciseId, ...entry } = req.body;
        if (
          (entry.distanceKm !== undefined && !hasPlaces(entry.distanceKm, 2)) ||
          (entry.inclinePct !== undefined && !hasPlaces(entry.inclinePct, 1)) ||
          (entry.speedKmh !== undefined && !hasPlaces(entry.speedKmh, 1))
        ) {
          return badRequest(reply);
        }
        try {
          return await upsertCardio(
            db,
            uid(req),
            req.params.id,
            exerciseId,
            entry,
          );
        } catch (err) {
          return sendWorkoutError(reply, err);
        }
      },
    );

    app.delete<{
      Params: { id: string; exerciseId: string; entryIndex: number };
    }>(
      "/workouts/:id/cardio/:exerciseId/:entryIndex",
      { ...auth, schema: deleteCardioSchema },
      async (req, reply) => {
        try {
          return await deleteCardio(
            db,
            uid(req),
            req.params.id,
            req.params.exerciseId,
            req.params.entryIndex,
          );
        } catch (err) {
          return sendWorkoutError(reply, err);
        }
      },
    );

    app.delete<{ Params: { id: string } }>(
      "/workouts/:id",
      { ...auth, schema: idSchema },
      async (req, reply) => {
        try {
          await discardSession(db, uid(req), req.params.id);
          return reply.code(204).send();
        } catch (err) {
          return sendWorkoutError(reply, err);
        }
      },
    );

    app.post<{ Params: { id: string } }>(
      "/workouts/:id/finish",
      { ...auth, schema: idSchema },
      async (req, reply): Promise<FinishSummary | undefined> => {
        const userId = uid(req);
        const sessionId = req.params.id;
        let summary: FinishSummary;
        try {
          summary = await finishSession(db, userId, sessionId, {
            requireContent: true,
          });
        } catch (err) {
          sendWorkoutError(reply, err);
          return;
        }
        let clear = () => {};
        try {
          const lineUserId = await findLineUserId(db, userId);
          if (lineUserId) {
            const templateName = await sessionTemplateName(
              db,
              userId,
              sessionId,
            );
            const limit = deadline(notifyTimeoutMs);
            clear = limit.clear;
            await Promise.race([
              notifyWorkoutFinished(lineUserId, summary, templateName),
              limit.promise,
            ]);
            await markNotified(db, sessionId);
            summary = { ...summary, notified: true };
          }
        } catch (err) {
          // Name only: messages could carry user data or tokens.
          req.log.warn(
            { err: { name: err instanceof Error ? err.name : "unknown" } },
            "workout notify failed",
          );
        } finally {
          clear();
        }
        return summary;
      },
    );
  };
