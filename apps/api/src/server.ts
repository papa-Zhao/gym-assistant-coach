import { buildApp } from "./app.js";
import type { AppDeps } from "./deps.js";

// Cloud Run injects PORT; listen on all interfaces inside the container.
const port = Number(process.env.PORT ?? 8080);

// Placeholder deps until real wiring lands (PR 3 Task 4).
const notConfigured = async (): Promise<never> => {
  throw new Error("not configured");
};
const deps: AppDeps = {
  db: new Proxy({} as AppDeps["db"], {
    get() {
      throw new Error("not configured");
    },
  }),
  verifyServiceToken: notConfigured,
  botServiceAccount: "",
  verifyLineIdToken: notConfigured,
  sessionSecret: new Uint8Array(0),
  corsOrigin: "",
};
const app = buildApp(deps, { logger: true });

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
