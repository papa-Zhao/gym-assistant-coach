import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONSENT_VERSION } from "@gac/shared";

// The policy pages are static files in public/ and cannot import TS, so the
// version and the required content are checked here. Whitespace is collapsed
// as the browser renders it (prettier wraps lines between words).
const read = (name: string) =>
  readFileSync(join(import.meta.dirname, "..", "public", name), "utf8").replace(
    /\s+/g,
    " ",
  );

const pages = {
  "privacy.html": read("privacy.html"),
  "terms.html": read("terms.html"),
};

describe.each(Object.entries(pages))("%s", (_name, html) => {
  it("shows the current consent version", () => {
    expect(html).toContain(`版本 ${CONSENT_VERSION}`);
  });

  it("has no placeholders or draft notice", () => {
    expect(html).not.toContain("[");
    expect(html).not.toContain("]");
    expect(html).not.toContain("草稿");
  });

  it("names the operator and the service email", () => {
    expect(html).toContain("Papa Zhao");
    expect(html).toContain("gymassistantcoach@gmail.com");
  });
});

describe("privacy.html", () => {
  it.each(["90 天", "7 天", "Anthropic", "JSON", "無法取消", "新加坡"])(
    "mentions %s",
    (text) => {
      expect(pages["privacy.html"]).toContain(text);
    },
  );
});
