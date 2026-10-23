import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { buildApp } from "./app.js";
import { instrument } from "./db/timing.js";
import { loadLoadtestConfig } from "./loadtest/config.js";
import { createFakeDeps } from "./loadtest/fakes.js";
import { loggerOptions } from "./logging.js";

// Load-test entry point: the real app and database with fake AI, photo
// storage, LINE and service-account verification. Deployed only as the
// temporary api-loadtest service (docs/launch/load-test.md).
let config: ReturnType<typeof loadLoadtestConfig>;
try {
  config = loadLoadtestConfig(process.env);
} catch (err) {
  console.error(err instanceof Error ? err.message : "invalid configuration");
  process.exit(1);
}

const sql = instrument(postgres(config.databaseUrl, { max: 5 }));

const app = buildApp(
  {
    db: drizzle(sql),
    ...createFakeDeps({
      internalToken: config.internalToken,
      aiDelayMs: config.aiDelayMs,
    }),
    sessionSecret: config.sessionSecret,
    corsOrigin: config.corsOrigin,
    rateLimitIpMax: config.rateLimitIpMax,
    now: () => new Date(),
  },
  { logger: loggerOptions, disableRequestLogging: true },
);

app.log.warn("LOADTEST SERVER: fake AI, do not route production traffic");

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
