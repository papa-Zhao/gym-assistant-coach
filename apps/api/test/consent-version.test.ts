import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONSENT_VERSION } from "@gac/shared";

// The bot sends its own copy in the consent postback; a mismatch would ask
// users to consent again forever.
const botSettings = readFileSync(
  new URL("../../bot/app/settings.py", import.meta.url),
  "utf8",
);

describe("CONSENT_VERSION", () => {
  it("is a date", () => {
    expect(CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("matches the bot's copy", () => {
    const m = /^CONSENT_VERSION = "(.+)"$/m.exec(botSettings);
    expect(m?.[1]).toBe(CONSENT_VERSION);
  });
});
