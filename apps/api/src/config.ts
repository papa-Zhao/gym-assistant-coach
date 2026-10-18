export interface Config {
  port: number;
  databaseUrl: string;
  sessionSecret: Uint8Array;
  lineLoginChannelId: string;
  botServiceAccount: string;
  internalAudience: string;
  corsOrigin: string;
}

const REQUIRED = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "LINE_LOGIN_CHANNEL_ID",
  "BOT_SA_EMAIL",
  "INTERNAL_AUDIENCE",
  "CORS_ORIGIN",
] as const;

const MIN_SECRET_BYTES = 32;

/**
 * Reads and validates the process environment. Error messages name variables
 * only; they never include a value.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
  const get = (name: (typeof REQUIRED)[number]): string => env[name] as string;

  const sessionSecret = new TextEncoder().encode(get("SESSION_SECRET"));
  if (sessionSecret.byteLength < MIN_SECRET_BYTES) {
    throw new Error(
      `SESSION_SECRET must be at least ${MIN_SECRET_BYTES} bytes`,
    );
  }

  const corsOrigin = get("CORS_ORIGIN");
  if (!isHttpsOrigin(corsOrigin)) {
    throw new Error(
      "CORS_ORIGIN must be an exact https:// origin with no path",
    );
  }

  const port = env.PORT ? Number(env.PORT) : 8080;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid port number");
  }

  return {
    port,
    databaseUrl: get("DATABASE_URL"),
    sessionSecret,
    lineLoginChannelId: get("LINE_LOGIN_CHANNEL_ID"),
    botServiceAccount: get("BOT_SA_EMAIL"),
    internalAudience: get("INTERNAL_AUDIENCE"),
    corsOrigin,
  };
}

function isHttpsOrigin(value: string): boolean {
  if (!value.startsWith("https://")) return false;
  try {
    const url = new URL(value);
    // An exact origin round-trips unchanged: no path, query, hash or userinfo.
    return url.protocol === "https:" && url.origin === value;
  } catch {
    return false;
  }
}
