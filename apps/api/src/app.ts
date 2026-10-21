import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { HealthResponse } from "@gac/shared";
import { newDbStats, withDbStats, type DbStats } from "./db/timing.js";
import type { AppDeps } from "./deps.js";
import { apiErrorHandler } from "./http.js";
import { authRoutes } from "./auth/routes.js";
import { profileRoutes } from "./profile/routes.js";
import { metricsRoutes } from "./metrics/routes.js";
import { exerciseRoutes } from "./workouts/exercise-routes.js";
import { templateRoutes } from "./workouts/template-routes.js";
import { sessionRoutes } from "./workouts/session-routes.js";
import { internalRoutes } from "./internal/routes.js";

export function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
  const app = Fastify(options);
  app.setErrorHandler(apiErrorHandler);

  // One log line per request: route template (never the URL with ids), status,
  // total time and database work. No bodies or user data.
  const stats = new WeakMap<object, DbStats>();
  app.addHook("onRequest", (req, _reply, done) => {
    const s = newDbStats();
    stats.set(req, s);
    withDbStats(s, done);
  });
  app.addHook("onResponse", (req, reply, done) => {
    const db = deps.dbStats?.() ?? stats.get(req) ?? newDbStats();
    req.log.info(
      {
        route: req.routeOptions.url,
        method: req.method,
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
        dbQueries: db.queries,
        dbMs: Math.round(db.ms),
      },
      "request timing",
    );
    done();
  });

  app.get("/health", async (): Promise<HealthResponse> => {
    return { status: "ok", service: "api" };
  });

  app.register(cors, {
    // A plain string would always be echoed; match the request origin instead.
    origin: (origin, cb) => cb(null, origin === deps.corsOrigin),
    // The plugin's default omits PUT and DELETE, which the LIFF app needs.
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE"],
  });
  app.register(authRoutes(deps));
  app.register(profileRoutes(deps));
  app.register(metricsRoutes(deps));
  app.register(exerciseRoutes(deps));
  app.register(templateRoutes(deps));
  app.register(sessionRoutes(deps));
  app.register(internalRoutes(deps), { prefix: "/internal" });

  return app;
}
