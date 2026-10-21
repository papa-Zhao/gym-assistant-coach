import { OAuth2Client } from "google-auth-library";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { buildApp } from "./app.js";
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

const deps: AppDeps = {
  db: drizzle(sql),
  verifyServiceToken,
  botServiceAccount: config.botServiceAccount,
  verifyLineIdToken: createLineVerifier(config.lineLoginChannelId),
  notifyWorkoutFinished: createBotNotifier(config.botUrl, config.botAudience),
  sessionSecret: config.sessionSecret,
  corsOrigin: config.corsOrigin,
  now: () => new Date(),
};
const app = buildApp(deps, { logger: true, disableRequestLogging: true });

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
