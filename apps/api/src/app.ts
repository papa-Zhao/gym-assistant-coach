import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { HealthResponse } from "@gac/shared";
import type { AppDeps } from "./deps.js";
import { authRoutes } from "./auth/routes.js";
import { internalRoutes } from "./internal/routes.js";

export function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
  const app = Fastify(options);

  app.get("/health", async (): Promise<HealthResponse> => {
    return { status: "ok", service: "api" };
  });

  app.register(cors, {
    // A plain string would always be echoed; match the request origin instead.
    origin: (origin, cb) => cb(null, origin === deps.corsOrigin),
  });
  app.register(authRoutes(deps));
  app.register(internalRoutes(deps), { prefix: "/internal" });

  return app;
}
