import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const full = {
  DATABASE_URL: "postgres://u:pw-secret@h:5432/d",
  SESSION_SECRET: "s".repeat(40),
  LINE_LOGIN_CHANNEL_ID: "12345",
  BOT_SA_EMAIL: "bot@x.iam.gserviceaccount.com",
  INTERNAL_AUDIENCE: "gac-api-internal",
  CORS_ORIGIN: "https://example.web.app",
};

describe("loadConfig", () => {
  it("lists missing variable names without values", () => {
    const rest: Record<string, string> = { ...full };
    delete rest.DATABASE_URL;
    delete rest.BOT_SA_EMAIL;
    let message = "";
    try {
      loadConfig(rest);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("BOT_SA_EMAIL");
    expect(message).not.toContain("LINE_LOGIN_CHANNEL_ID");
    for (const v of Object.values(rest)) expect(message).not.toContain(v);
  });

  it("treats empty values as missing", () => {
    expect(() => loadConfig({ ...full, CORS_ORIGIN: "" })).toThrow(
      /CORS_ORIGIN/,
    );
  });

  it("rejects short SESSION_SECRET", () => {
    const short = "short-secret-value";
    let message = "";
    try {
      loadConfig({ ...full, SESSION_SECRET: short });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("SESSION_SECRET");
    expect(message).not.toContain(short);
  });

  it("counts SESSION_SECRET length in UTF-8 bytes", () => {
    // 11 chars x 3 bytes = 33 bytes
    expect(
      loadConfig({ ...full, SESSION_SECRET: "密".repeat(11) }).sessionSecret
        .byteLength,
    ).toBe(33);
  });

  it.each([
    "http://example.web.app",
    "https://example.web.app/",
    "https://example.web.app/path",
    "example.web.app",
  ])("rejects CORS_ORIGIN %s without echoing it", (origin) => {
    let message = "";
    try {
      loadConfig({ ...full, CORS_ORIGIN: origin });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("CORS_ORIGIN");
    expect(message).not.toContain(origin);
  });

  it("parses a full env", () => {
    const c = loadConfig(full);
    expect(c.port).toBe(8080);
    expect(c.databaseUrl).toBe(full.DATABASE_URL);
    expect(c.sessionSecret).toEqual(
      new TextEncoder().encode(full.SESSION_SECRET),
    );
    expect(c.lineLoginChannelId).toBe("12345");
    expect(c.botServiceAccount).toBe(full.BOT_SA_EMAIL);
    expect(c.internalAudience).toBe("gac-api-internal");
    expect(c.corsOrigin).toBe("https://example.web.app");
    expect(loadConfig({ ...full, PORT: "9000" }).port).toBe(9000);
  });
});
