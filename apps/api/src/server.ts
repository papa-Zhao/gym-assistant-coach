import { buildApp } from "./app.js";

// Cloud Run injects PORT; listen on all interfaces inside the container.
const port = Number(process.env.PORT ?? 8080);
const app = buildApp({ logger: true });

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
