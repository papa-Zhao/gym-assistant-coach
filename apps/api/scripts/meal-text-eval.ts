// Manual regression check: runs the fixture phrasings through the real
// meal parser (real Anthropic API, costs a few cents). Not part of CI or
// `npm test`.
//   read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY
//   npm run eval:meal-text -w @gac/api
//   unset ANTHROPIC_API_KEY
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import type { FastifyBaseLogger } from "fastify";
import {
  AI_CLIENT_MAX_RETRIES,
  AI_CLIENT_TIMEOUT_MS,
  AI_MODEL,
} from "../src/ai/config";
import { createMealParser } from "../src/ai/meal-parser";

interface Case {
  text: string;
  kcal: [number, number] | null;
  expect?: "not_food";
}

// USD per million tokens for claude-haiku-5-5 (prompts <= 100K tokens).
// Cache figures are assumed multipliers of the input price (read 0.1x,
// write 1.25x), not published rates. Estimate only.
const INPUT_PRICE = 0.1;
const PRICE_PER_MTOK = {
  input: INPUT_PRICE,
  output: 0.5,
  cacheRead: INPUT_PRICE * 0.1,
  cacheWrite: INPUT_PRICE * 1.25,
};

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(
      "ANTHROPIC_API_KEY is not set, so nothing was run.\n" +
        "This script calls the real Anthropic API (about 10 requests to " +
        `${AI_MODEL}).\n` +
        "Run it with:\n" +
        "  read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY\n" +
        "  npm run eval:meal-text -w @gac/api\n" +
        "  unset ANTHROPIC_API_KEY",
    );
    return;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cases = JSON.parse(
    readFileSync(path.resolve(here, "fixtures/meal-text-cases.json"), "utf8"),
  ) as Case[];

  const client = new Anthropic({
    timeout: AI_CLIENT_TIMEOUT_MS,
    maxRetries: AI_CLIENT_MAX_RETRIES,
  });
  // The parser never logs content, so a console-backed stub is enough.
  const log = {
    info: () => undefined,
    warn: console.warn,
    error: console.error,
  } as unknown as FastifyBaseLogger;
  const parser = createMealParser(client, log);

  let pass = 0;
  let cost = 0;
  for (const c of cases) {
    const started = Date.now();
    let verdict: string;
    let ok: boolean;
    let tokens = "";
    try {
      const r = await parser.parseText(c.text);
      const u = r.usage;
      tokens = `in ${u.input} out ${u.output} cache ${u.cacheRead}/${u.cacheCreation}`;
      cost +=
        (u.input * PRICE_PER_MTOK.input +
          u.output * PRICE_PER_MTOK.output +
          u.cacheRead * PRICE_PER_MTOK.cacheRead +
          u.cacheCreation * PRICE_PER_MTOK.cacheWrite) /
        1_000_000;
      if (r.kind === "items") {
        const kcal = Math.round(r.items.reduce((s, i) => s + i.kcal, 0));
        ok = c.kcal !== null && kcal >= c.kcal[0] && kcal <= c.kcal[1];
        verdict = `${r.items.length} items, ${kcal} kcal, ${ok ? "in" : "OUT OF"} range`;
      } else {
        ok = c.expect === "not_food" && r.kind === "not_food";
        verdict = r.kind;
      }
    } catch (err) {
      ok = false;
      verdict = `error: ${err instanceof Error ? err.name : "unknown"}`;
    }
    if (ok) pass++;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${c.text} | ${verdict} | ${tokens} | ${Date.now() - started} ms`,
    );
  }
  console.log(
    `\n${pass}/${cases.length} as expected. Estimated cost: $${cost.toFixed(4)} (${AI_MODEL})`,
  );
}

void main();
