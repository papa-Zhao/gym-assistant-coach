export interface LoadtestConfig {
  port: number;
  databaseUrl: string;
  sessionSecret: Uint8Array;
  corsOrigin: string;
  internalToken: string;
  aiDelayMs: number;
  /** Per-IP requests per minute: k6 sends everything from one IP. */
  rateLimitIpMax: number;
}

const REQUIRED = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "CORS_ORIGIN",
  "LOADTEST_INTERNAL_TOKEN",
] as const;

const MIN_SECRET_BYTES = 32;
const DEFAULT_AI_DELAY_MS = 2000;
const MAX_AI_DELAY_MS = 20_000;
const DEFAULT_RATE_LIMIT_IP_MAX = 100_000;
const MAX_RATE_LIMIT_IP_MAX = 1_000_000;

/** Parses an optional integer variable in [min, max]; throws naming the variable only. */
function intVar(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return n;
}

/**
 * Throws when K_SERVICE is "api", a variable is missing,
 * LOADTEST_INTERNAL_TOKEN or SESSION_SECRET is under 32 bytes, or
 * FAKE_AI_DELAY_MS is outside 0–20000. Messages name variables only.
 */
export function loadLoadtestConfig(env: NodeJS.ProcessEnv): LoadtestConfig {
  // Cloud Run sets K_SERVICE to the service name: never fake the real api.
  if (env.K_SERVICE === "api") {
    throw new Error(
      "K_SERVICE is api: the load-test server must not run as the production service",
    );
  }
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
  const internalToken = get("LOADTEST_INTERNAL_TOKEN");
  if (new TextEncoder().encode(internalToken).byteLength < MIN_SECRET_BYTES) {
    throw new Error(
      `LOADTEST_INTERNAL_TOKEN must be at least ${MIN_SECRET_BYTES} bytes`,
    );
  }

  return {
    port: intVar(env, "PORT", 8080, 1, 65535),
    databaseUrl: get("DATABASE_URL"),
    sessionSecret,
    corsOrigin: get("CORS_ORIGIN"),
    internalToken,
    aiDelayMs: intVar(
      env,
      "FAKE_AI_DELAY_MS",
      DEFAULT_AI_DELAY_MS,
      0,
      MAX_AI_DELAY_MS,
    ),
    rateLimitIpMax: intVar(
      env,
      "RATE_LIMIT_IP_MAX",
      DEFAULT_RATE_LIMIT_IP_MAX,
      1,
      MAX_RATE_LIMIT_IP_MAX,
    ),
  };
}
