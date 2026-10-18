import Fastify, { type FastifyServerOptions } from "fastify";
import type { HealthResponse } from "@gac/shared";
import type { AppDeps } from "./deps.js";
import { internalRoutes } from "./internal/routes.js";

export function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
  const app = Fastify(options);

  app.get("/health", async (): Promise<HealthResponse> => {
    return { status: "ok", service: "api" };
  });

  app.register(internalRoutes(deps), { prefix: "/internal" });

  return app;
}
