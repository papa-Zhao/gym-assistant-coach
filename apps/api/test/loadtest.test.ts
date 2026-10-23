import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONSENT_VERSION } from "@gac/shared";
import { buildApp } from "../src/app.js";
import { loadLoadtestConfig } from "../src/loadtest/config";
import {
  createFakeDeps,
  LOADTEST_BOT_SA,
  LOADTEST_SCHEDULER_SA,
} from "../src/loadtest/fakes";
import { RATE_LIMIT_IP_MAX } from "../src/rate-limit";
import { createTestDb } from "./db";

const TOKEN = "t".repeat(32);
const full = {
  DATABASE_URL: "postgres://u:pw-secret@h:5432/d",
  SESSION_SECRET: "s".repeat(40),
  CORS_ORIGIN: "https://loadtest.invalid",
  LOADTEST_INTERNAL_TOKEN: TOKEN,
};

describe("loadLoadtestConfig", () => {
  it("reads the variables with defaults", () => {
    const c = loadLoadtestConfig({ ...full, K_SERVICE: "api-loadtest" });
    expect(c.aiDelayMs).toBe(2000);
    expect(c.internalToken).toBe(TOKEN);
    expect(c.port).toBe(8080);
    expect(c.rateLimitIpMax).toBeGreaterThan(RATE_LIMIT_IP_MAX);
    expect(c.corsOrigin).toBe("https://loadtest.invalid");
  });

  it("refuses to run as the production api service", () => {
    expect(() => loadLoadtestConfig({ ...full, K_SERVICE: "api" })).toThrow(
      /K_SERVICE/,
    );
  });

  it("names missing variables without values", () => {
    const rest: Record<string, string> = { ...full };
    delete rest.LOADTEST_INTERNAL_TOKEN;
    let message = "";
    try {
      loadLoadtestConfig(rest);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("LOADTEST_INTERNAL_TOKEN");
    expect(message).not.toContain("pw-secret");
    expect(message).not.toContain("s".repeat(40));
  });

  it("rejects short secrets", () => {
    expect(() =>
      loadLoadtestConfig({ ...full, LOADTEST_INTERNAL_TOKEN: "t".repeat(31) }),
    ).toThrow(/LOADTEST_INTERNAL_TOKEN/);
    expect(() =>
      loadLoadtestConfig({ ...full, SESSION_SECRET: "s".repeat(31) }),
    ).toThrow(/SESSION_SECRET/);
  });

  it.each(["-1", "20001", "abc", "1.5"])("rejects FAKE_AI_DELAY_MS=%s", (v) => {
    expect(() => loadLoadtestConfig({ ...full, FAKE_AI_DELAY_MS: v })).toThrow(
      /FAKE_AI_DELAY_MS/,
    );
  });

  it("accepts FAKE_AI_DELAY_MS and RATE_LIMIT_IP_MAX overrides", () => {
    const c = loadLoadtestConfig({
      ...full,
      FAKE_AI_DELAY_MS: "0",
      RATE_LIMIT_IP_MAX: "500",
    });
    expect(c.aiDelayMs).toBe(0);
    expect(c.rateLimitIpMax).toBe(500);
  });

  it.each(["0", "abc", "1000001"])("rejects RATE_LIMIT_IP_MAX=%s", (v) => {
    expect(() => loadLoadtestConfig({ ...full, RATE_LIMIT_IP_MAX: v })).toThrow(
      /RATE_LIMIT_IP_MAX/,
    );
  });
});

describe("fake verifiers", () => {
  const fakes = createFakeDeps({ internalToken: TOKEN, aiDelayMs: 0 });

  it("accepts only the exact internal token", async () => {
    await expect(fakes.verifyServiceToken(TOKEN)).resolves.toEqual({
      email: LOADTEST_BOT_SA,
    });
    await expect(fakes.verifyServiceToken("x".repeat(32))).rejects.toThrow();
    await expect(fakes.verifyServiceToken("")).rejects.toThrow();
    await expect(fakes.verifyServiceToken(TOKEN + "t")).rejects.toThrow();
    await expect(fakes.verifyServiceToken(TOKEN.slice(1))).rejects.toThrow();
  });

  it("accepts only loadtest: LINE tokens", async () => {
    await expect(fakes.verifyLineIdToken("loadtest:u001")).resolves.toEqual({
      sub: "u001",
      name: "壓測 u001",
    });
    await expect(fakes.verifyLineIdToken("loadtest:")).rejects.toThrow();
    await expect(fakes.verifyLineIdToken("u001")).rejects.toThrow();
    await expect(
      fakes.verifyLineIdToken("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJVMSJ9.c2ln"),
    ).rejects.toThrow();
  });

  it("never lets the scheduler identity match the bot one", () => {
    expect(fakes.schedulerServiceAccount).toBe(LOADTEST_SCHEDULER_SA);
    expect(LOADTEST_SCHEDULER_SA).not.toBe(LOADTEST_BOT_SA);
  });
});

describe("load-test app", () => {
  const LINE_ID = `U${"1".repeat(32)}`;
  const bot = { authorization: `Bearer ${TOKEN}` };
  let app: ReturnType<typeof buildApp>;
  let closeDb: () => Promise<void>;

  beforeAll(async () => {
    const t = await createTestDb();
    closeDb = t.close;
    app = buildApp({
      db: t.db,
      ...createFakeDeps({ internalToken: TOKEN, aiDelayMs: 0 }),
      sessionSecret: new Uint8Array(32).fill(3),
      corsOrigin: "https://loadtest.invalid",
      now: () => new Date(),
    });
  });
  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it("signs a user in through the real sync, consent and LIFF flow", async () => {
    const post = (url: string, payload: object) =>
      app.inject({ method: "POST", url, payload, headers: bot });
    expect(
      (await post("/internal/users/sync", { lineUserId: LINE_ID })).statusCode,
    ).toBe(200);
    expect(
      (
        await post("/internal/users/consent", {
          lineUserId: LINE_ID,
          version: CONSENT_VERSION,
        })
      ).statusCode,
    ).toBe(204);
    const login = await app.inject({
      method: "POST",
      url: "/auth/liff",
      payload: { idToken: `loadtest:${LINE_ID}` },
    });
    expect(login.statusCode).toBe(200);
    const me = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${login.json().accessToken}` },
    });
    expect(me.statusCode).toBe(200);
  });

  it("rejects the internal routes without the token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/users/sync",
      payload: { lineUserId: LINE_ID },
      headers: { authorization: "Bearer wrong" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("answers meals and questions with the fake AI", async () => {
    const meal = await app.inject({
      method: "POST",
      url: "/internal/meals/text",
      payload: { lineUserId: LINE_ID, mealType: "lunch", text: "雞腿便當" },
      headers: bot,
    });
    expect(meal.statusCode).toBe(200);
    expect(meal.json().outcome).toBe("draft");
    expect(meal.json().meal.items).toHaveLength(2);

    const ask = await app.inject({
      method: "POST",
      url: "/internal/ai/ask",
      payload: { lineUserId: LINE_ID, text: "今天練什麼？" },
      headers: bot,
    });
    expect(ask.statusCode).toBe(200);
    expect(ask.json().outcome).toBe("answer");
    expect(ask.json().advice.body).toContain("壓測");
    expect(ask.json().advice.program).toBeNull();
  });
});

describe("server.ts", () => {
  it("never imports the load-test fakes", () => {
    const src = readFileSync(
      new URL("../src/server.ts", import.meta.url),
      "utf8",
    );
    expect(src).not.toContain("loadtest");
  });
});
