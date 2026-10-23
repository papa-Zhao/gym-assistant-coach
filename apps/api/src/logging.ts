import type { FastifyLoggerOptions } from "fastify";

// Cloud Logging reads `severity`, not pino's numeric `level`; without it every
// line lands as DEFAULT and the ERROR-log alert never fires.
const SEVERITY: Record<string, string> = {
  trace: "DEBUG",
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
  fatal: "CRITICAL",
};

export const loggerOptions: FastifyLoggerOptions & {
  formatters: { level(label: string): { severity: string } };
} = {
  level: "info",
  formatters: {
    level: (label) => ({ severity: SEVERITY[label] ?? "DEFAULT" }),
  },
};
