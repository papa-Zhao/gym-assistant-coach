import Anthropic from "@anthropic-ai/sdk";
import type { FastifyBaseLogger } from "fastify";
import { OAuth2Client } from "google-auth-library";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { buildApp } from "./app.js";
import { AI_CLIENT_MAX_RETRIES, AI_CLIENT_TIMEOUT_MS } from "./ai/config.js";
import { createMealParser } from "./ai/meal-parser.js";
import { instrument } from "./db/timing.js";
import { createLineVerifier } from "./auth/line.js";
import { loadConfig } from "./config.js";
import { createBotNotifier } from "./notify/bot.js";
import type { AppDeps, VerifyServiceToken } from "./deps.js";

// Fail fast (before listening) on bad config. Messages name variables only.
let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig(process.env);
} catch (err) {
  console.error(err instanceof Error ? err.message : "invalid configuration");
  process.exit(1);
}

// postgres.js connects lazily, so /health works without a reachable database.
const sql = instrument(postgres(config.databaseUrl, { max: 5 }));

const googleClient = new OAuth2Client();
const verifyServiceToken: VerifyServiceToken = async (idToken) => {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: config.internalAudience,
  });
  const payload = ticket.getPayload();
  if (!payload?.email || payload.email_verified !== true) {
    throw new Error("service token has no verified email");
  }
  return { email: payload.email };
};

// The parser logs through the app logger, which exists only after buildApp.
const appRef: { current?: ReturnType<typeof buildApp> } = {};
const appLog = () => (appRef.current as ReturnType<typeof buildApp>).log;
const parserLog = {
  info: (fields: object, msg: string) => appLog().info(fields, msg),
  warn: (fields: object, msg: string) => appLog().warn(fields, msg),
  error: (fields: object, msg: string) => appLog().error(fields, msg),
} as unknown as FastifyBaseLogger;

const anthropic = new Anthropic({
  apiKey: config.anthropicApiKey,
  timeout: AI_CLIENT_TIMEOUT_MS,
  maxRetries: AI_CLIENT_MAX_RETRIES,
});

const deps: AppDeps = {
  db: drizzle(sql),
  verifyServiceToken,
  botServiceAccount: config.botServiceAccount,
  verifyLineIdToken: createLineVerifier(config.lineLoginChannelId),
  notifyWorkoutFinished: createBotNotifier(config.botUrl, config.botAudience),
  mealParser: createMealParser(anthropic, parserLog),
  sessionSecret: config.sessionSecret,
  corsOrigin: config.corsOrigin,
  now: () => new Date(),
};
const app = buildApp(deps, { logger: true, disableRequestLogging: true });
appRef.current = app;

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
