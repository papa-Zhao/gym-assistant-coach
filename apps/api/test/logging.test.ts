import { Writable } from "node:stream";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { loggerOptions } from "../src/logging";
import {
  unusedMealParser,
  unusedPhotoStore,
  unusedAdvisor,
  unusedEquipmentIdentifier,
  unusedWorkoutAdvisor,
} from "./db";

function captureStream() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const parsed = () =>
    lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  return { stream, parsed };
}

const notUsed = async (): Promise<never> => {
  throw new Error("not used in this test");
};

const deps: AppDeps = {
  db: {} as AppDeps["db"],
  verifyServiceToken: notUsed,
  botServiceAccount: "bot@example.iam.gserviceaccount.com",
  schedulerServiceAccount: "scheduler@x",
  verifyLineIdToken: notUsed,
  notifyWorkoutFinished: async () => {},
  mealParser: unusedMealParser,
  equipmentIdentifier: unusedEquipmentIdentifier,
  advisor: unusedAdvisor,
  workoutAdvisor: unusedWorkoutAdvisor,
  photoStore: unusedPhotoStore,
  sessionSecret: new Uint8Array(32),
  corsOrigin: "http://localhost",
  now: () => new Date("2026-10-19T04:00:00Z"),
};

describe("Cloud Logging severity", () => {
  it("writes severity labels instead of numeric levels", async () => {
    const { stream, parsed } = captureStream();
    const app = Fastify({ logger: { ...loggerOptions, stream } });
    app.log.info("hello");
    app.log.error("broken");
    await app.close();

    const [info, error] = parsed();
    expect(info).toMatchObject({ severity: "INFO", msg: "hello" });
    expect(error).toMatchObject({ severity: "ERROR", msg: "broken" });
    expect(info).not.toHaveProperty("level");
    expect(error).not.toHaveProperty("level");
  });

  it("maps every pino level", () => {
    const sev = (label: string) =>
      loggerOptions.formatters.level(label).severity;
    expect(sev("trace")).toBe("DEBUG");
    expect(sev("debug")).toBe("DEBUG");
    expect(sev("info")).toBe("INFO");
    expect(sev("warn")).toBe("WARNING");
    expect(sev("error")).toBe("ERROR");
    expect(sev("fatal")).toBe("CRITICAL");
  });

  it("logs internal request errors as ERROR", async () => {
    const { stream, parsed } = captureStream();
    const app = buildApp(deps, {
      logger: { ...loggerOptions, stream },
      disableRequestLogging: true,
    });
    app.get("/boom", async () => {
      throw new Error("boom");
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    await app.close();

    const line = parsed().find(
      (l) => l.msg === "request failed with an internal error",
    );
    expect(line).toMatchObject({ severity: "ERROR" });
  });
});
