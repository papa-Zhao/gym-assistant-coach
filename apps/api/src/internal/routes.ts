import {
  isValidMetric,
  roundMetric,
  taipeiDate,
  type ApiError,
  type MetricKey,
  type MetricRecordedResponse,
  type TodayResponse,
} from "@gac/shared";
import type { FastifyPluginAsync } from "fastify";
import { apiErrorHandler, bearerAuth } from "../http.js";
import type { AppDeps } from "../deps.js";
import { consumedOn } from "../meals/repo";
import { todayWorkoutSummary } from "../workouts/repo";
import { formatWorkoutSummary } from "../workouts/summary";
import { previousMetric, recordMetric } from "../metrics/repo";
import { getProfile } from "../profile/repo";
import {
  findByLineUserId,
  markUnfollowed,
  recordConsent,
  syncUser,
} from "../users/repo";

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

const bodyMetricSchema = {
  body: {
    type: "object",
    required: ["lineUserId", "key", "value"],
    additionalProperties: false,
    properties: {
      lineUserId,
      key: { enum: ["weightKg", "bodyFatPct", "waistCm"] },
      value: { type: "number" },
    },
  },
} as const;

export const internalRoutes =
  (deps: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const { db, verifyServiceToken, botServiceAccount, now } = deps;

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

    app.post<{ Body: { lineUserId: string } }>(
      "/users/today",
      { schema: unfollowSchema },
      async (req): Promise<TodayResponse> => {
        const user = await findByLineUserId(db, req.body.lineUserId);
        const profile = user ? await getProfile(db, user.id) : null;
        const clock = now();
        const date = taipeiDate(clock);
        const workout = user
          ? await todayWorkoutSummary(db, user.id, date)
          : null;
        const consumed = user
          ? await consumedOn(db, user.id, date, clock)
          : { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 };
        return {
          hasProfile: profile !== null,
          date,
          targets: profile?.targets ?? null,
          consumed,
          workoutSummary: workout ? formatWorkoutSummary(workout) : null,
          weightKg: profile?.weightKg ?? null,
          streakDays: 0,
        };
      },
    );

    app.post<{ Body: { lineUserId: string; key: MetricKey; value: number } }>(
      "/body-metrics",
      { schema: bodyMetricSchema },
      async (req, reply): Promise<MetricRecordedResponse> => {
        const { lineUserId, key, value } = req.body;
        if (!isValidMetric(key, value)) {
          return reply
            .code(400)
            .send({ error: "bad_request" } satisfies ApiError);
        }
        const { userId } = await syncUser(db, lineUserId, null);
        const date = taipeiDate(now());
        await recordMetric(db, userId, date, key, value);
        return {
          key,
          value: roundMetric(value),
          date,
          previous: await previousMetric(db, userId, key, date),
        };
      },
    );
  };
