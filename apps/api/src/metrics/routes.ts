import {
  addDays,
  isValidMetric,
  taipeiDate,
  type ApiError,
  type BodyMetricsResponse,
  type MetricKey,
} from "@gac/shared";
import type { FastifyPluginAsync } from "fastify";
import { apiErrorHandler, bearerAuth } from "../http.js";
import type { AppDeps } from "../deps.js";
import { verifySession } from "../auth/session";
import { listMetrics, recordMetrics } from "./repo";

const KEYS: MetricKey[] = ["weightKg", "bodyFatPct", "waistCm"];

const querySchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: { days: { type: "integer", enum: [7, 30, 90], default: 30 } },
  },
} as const;

const todaySchema = {
  body: {
    type: "object",
    additionalProperties: false,
    minProperties: 1,
    properties: {
      weightKg: { type: "number" },
      bodyFatPct: { type: "number" },
      waistCm: { type: "number" },
    },
  },
} as const;

declare module "fastify" {
  interface FastifyRequest {
    metricsUserId?: string;
  }
}

export const metricsRoutes =
  (deps: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const { db, sessionSecret, now } = deps;

    app.setErrorHandler(apiErrorHandler);

    const authenticate = bearerAuth(
      (token) => verifySession(sessionSecret, token),
      (req, { userId }) => {
        req.metricsUserId = userId;
      },
    );

    const window = async (
      userId: string,
      days: number,
    ): Promise<BodyMetricsResponse> => {
      const to = taipeiDate(now());
      const from = addDays(to, -(days - 1));
      return { from, to, points: await listMetrics(db, userId, from, to) };
    };

    app.get<{ Querystring: { days: number } }>(
      "/body-metrics",
      { onRequest: authenticate, schema: querySchema },
      async (req): Promise<BodyMetricsResponse> =>
        window(req.metricsUserId as string, req.query.days),
    );

    app.put<{ Body: Partial<Record<MetricKey, number>> }>(
      "/body-metrics/today",
      { onRequest: authenticate, schema: todaySchema },
      async (req, reply) => {
        const entries: [MetricKey, number][] = [];
        for (const key of KEYS) {
          const value = req.body[key];
          if (value === undefined) continue;
          if (!isValidMetric(key, value)) {
            return reply
              .code(400)
              .send({ error: "bad_request" } satisfies ApiError);
          }
          entries.push([key, value]);
        }
        const userId = req.metricsUserId as string;
        await recordMetrics(db, userId, taipeiDate(now()), entries);
        return window(userId, 30);
      },
    );
  };
