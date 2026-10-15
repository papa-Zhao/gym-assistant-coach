import Fastify, { type FastifyServerOptions } from "fastify";
import type { HealthResponse } from "@gac/shared";

export function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options);

  app.get("/health", async (): Promise<HealthResponse> => {
    return { status: "ok", service: "api" };
  });

  return app;
}
