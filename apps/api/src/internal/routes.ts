import {
  MEAL_PHOTO_MAX_BYTES,
  MEAL_TYPES,
  isValidMetric,
  roundMetric,
  taipeiDate,
  type ApiError,
  type MetricKey,
  type Meal,
  type MealType,
  type MetricRecordedResponse,
  type TodayResponse,
} from "@gac/shared";
import type { FastifyPluginAsync } from "fastify";
import { apiErrorHandler, bearerAuth } from "../http.js";
import type { AppDeps } from "../deps.js";
import { confirmMeal, consumedOn, setMealType } from "../meals/repo";
import { logMealFromPhoto } from "../meals/photo";
import { logMealFromText } from "../meals/text";
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

const mealTypeSchema = { enum: [...MEAL_TYPES] } as const;

const mealTextSchema = {
  body: {
    type: "object",
    required: ["lineUserId", "mealType", "text"],
    additionalProperties: false,
    properties: {
      lineUserId,
      mealType: mealTypeSchema,
      text: { type: "string", minLength: 1, maxLength: 200 },
    },
  },
} as const;

const mealIdParams = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
} as const;

const mealConfirmSchema = { ...unfollowSchema, params: mealIdParams } as const;

const mealTypeChangeSchema = {
  params: mealIdParams,
  body: {
    type: "object",
    required: ["lineUserId", "mealType"],
    additionalProperties: false,
    properties: { lineUserId, mealType: mealTypeSchema },
  },
} as const;

const mealPhotoSchema = {
  headers: {
    type: "object",
    required: ["x-line-user-id"],
    properties: { "x-line-user-id": lineUserId },
  },
} as const;

const notFound = { error: "not_found" } satisfies ApiError;

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

    // Photo bytes arrive raw from the bot. Registered here only, so the public
    // routes keep rejecting octet-stream bodies.
    app.addContentTypeParser(
      "application/octet-stream",
      { parseAs: "buffer" },
      (_req, body, done) => done(null, body),
    );

    async function todayFor(
      userId: string | null,
      clock: Date,
    ): Promise<TodayResponse> {
      const profile = userId ? await getProfile(db, userId) : null;
      const date = taipeiDate(clock);
      const workout = userId
        ? await todayWorkoutSummary(db, userId, date)
        : null;
      const consumed = userId
        ? await consumedOn(db, userId, date, clock)
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
    }

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
        return todayFor(user?.id ?? null, now());
      },
    );

    app.post<{
      Body: { lineUserId: string; mealType: MealType; text: string };
    }>("/meals/text", { schema: mealTextSchema }, async (req, reply) => {
      const user = await findByLineUserId(db, req.body.lineUserId);
      if (!user) return reply.code(404).send(notFound);
      const outcome = await logMealFromText(
        { db, parser: deps.mealParser, now },
        user.id,
        req.body.mealType,
        req.body.text,
      );
      return outcome.kind === "draft"
        ? { outcome: "draft", meal: outcome.meal }
        : { outcome: outcome.kind };
    });

    app.post<{ Headers: { "x-line-user-id": string } }>(
      "/meals/photo",
      { schema: mealPhotoSchema, bodyLimit: MEAL_PHOTO_MAX_BYTES },
      async (req, reply) => {
        if (!Buffer.isBuffer(req.body)) {
          return reply
            .code(415)
            .send({ error: "unsupported_media_type" } satisfies ApiError);
        }
        const user = await findByLineUserId(db, req.headers["x-line-user-id"]);
        if (!user) return reply.code(404).send(notFound);
        const outcome = await logMealFromPhoto(
          {
            db,
            parser: deps.mealParser,
            photos: deps.photoStore,
            photoTimeoutMs: deps.photoTimeoutMs,
            now,
            log: req.log,
          },
          user.id,
          req.body,
        );
        return outcome.kind === "draft"
          ? { outcome: "draft", meal: outcome.meal }
          : { outcome: outcome.kind };
      },
    );

    app.post<{ Params: { id: string }; Body: { lineUserId: string } }>(
      "/meals/:id/confirm",
      { schema: mealConfirmSchema },
      async (req, reply) => {
        const user = await findByLineUserId(db, req.body.lineUserId);
        if (!user) return reply.code(404).send(notFound);
        const clock = now();
        const meal: Meal | null = await confirmMeal(
          db,
          user.id,
          req.params.id,
          clock,
        );
        if (!meal) return reply.code(404).send(notFound);
        const today = await todayFor(user.id, clock);
        return {
          meal,
          today: {
            date: today.date,
            consumed: today.consumed,
            targets: today.targets,
          },
        };
      },
    );

    app.post<{
      Params: { id: string };
      Body: { lineUserId: string; mealType: MealType };
    }>(
      "/meals/:id/type",
      { schema: mealTypeChangeSchema },
      async (req, reply) => {
        const user = await findByLineUserId(db, req.body.lineUserId);
        if (!user) return reply.code(404).send(notFound);
        const meal = await setMealType(
          db,
          user.id,
          req.params.id,
          req.body.mealType,
          now(),
        );
        if (!meal) return reply.code(404).send(notFound);
        return { meal };
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
