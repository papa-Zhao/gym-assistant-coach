import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { HealthResponse } from "@gac/shared";
import type { AppDeps } from "./deps.js";
import { apiErrorHandler } from "./http.js";
import { authRoutes } from "./auth/routes.js";
import { profileRoutes } from "./profile/routes.js";
import { internalRoutes } from "./internal/routes.js";

export function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
  const app = Fastify(options);
  app.setErrorHandler(apiErrorHandler);

  app.get("/health", async (): Promise<HealthResponse> => {
    return { status: "ok", service: "api" };
  });

  app.register(cors, {
    // A plain string would always be echoed; match the request origin instead.
    origin: (origin, cb) => cb(null, origin === deps.corsOrigin),
    // The plugin's default omits PUT, which the LIFF profile save needs.
    methods: ["GET", "HEAD", "POST", "PUT"],
  });
  app.register(authRoutes(deps));
  app.register(profileRoutes(deps));
  app.register(internalRoutes(deps), { prefix: "/internal" });

  return app;
}
