// Manual regression check: runs your own meal photos through the real
// photo pipeline (normalize + Anthropic parser; real API, costs a few
// cents). Not part of CI or `npm test`. Nothing is uploaded anywhere and
// no item names are printed.
//   read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY
//   npm run eval:meal-photo -w @gac/api -- <folder>
//   unset ANTHROPIC_API_KEY
// <folder>/cases.json:
//   [{ "file": "bento.jpg", "kcalMin": 700, "kcalMax": 1000, "note": "..." }]
// Use kcalMin: 0, kcalMax: 0 for a photo that is expected not to be food.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { FastifyBaseLogger } from "fastify";
import {
  AI_CLIENT_MAX_RETRIES,
  AI_CLIENT_TIMEOUT_MS,
  AI_MODEL,
} from "../src/ai/config";
import { createMealParser } from "../src/ai/meal-parser";
import { normalizeMealImage } from "../src/photos/image";
import { usageCost } from "./eval-cost";

interface Case {
  file: string;
  kcalMin: number;
  kcalMax: number;
  note?: string;
}

const USAGE =
  "Usage:\n" +
  "  read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY\n" +
  "  npm run eval:meal-photo -w @gac/api -- <folder>\n" +
  "  unset ANTHROPIC_API_KEY\n" +
  '<folder> holds the photos and a cases.json like:\n  [{ "file": "bento.jpg", "kcalMin": 700, "kcalMax": 1000, "note": "..." }]\n' +
  "Use kcalMin: 0, kcalMax: 0 for a photo that is not food.";

function isCase(v: unknown): v is Case {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.file === "string" &&
    typeof c.kcalMin === "number" &&
    typeof c.kcalMax === "number"
  );
}

async function main(): Promise<void> {
  const folderArg = process.argv[2];
  if (!process.env.ANTHROPIC_API_KEY || !folderArg) {
    console.log(
      `Nothing was run: ANTHROPIC_API_KEY and a folder are both needed.\nThis script calls the real Anthropic API (${AI_MODEL}), one request per photo.\n${USAGE}`,
    );
    return;
  }
  const folder = path.resolve(folderArg);
  const casesPath = path.join(folder, "cases.json");
  if (!existsSync(casesPath)) {
    console.log(`No cases.json in ${folder}.\n${USAGE}`);
    return;
  }
  const parsed: unknown = JSON.parse(readFileSync(casesPath, "utf8"));
  if (!Array.isArray(parsed) || !parsed.every(isCase)) {
    console.log(`cases.json has an invalid entry.\n${USAGE}`);
    return;
  }
  const cases: Case[] = parsed;

  const client = new Anthropic({
    timeout: AI_CLIENT_TIMEOUT_MS,
    maxRetries: AI_CLIENT_MAX_RETRIES,
  });
  const log = {
    info: () => undefined,
    warn: console.warn,
    error: console.error,
  } as unknown as FastifyBaseLogger;
  const parser = createMealParser(client, log);

  let pass = 0;
  let ran = 0;
  let cost = 0;
  for (const c of cases) {
    if (
      c.file.includes("/") ||
      c.file.includes("\\") ||
      c.file.includes("..")
    ) {
      console.log(`SKIP ${c.file} | file must be a plain name in the folder`);
      continue;
    }
    ran++;
    const started = Date.now();
    let verdict: string;
    let ok = false;
    let tokens = "";
    try {
      const jpeg = await normalizeMealImage(
        readFileSync(path.join(folder, c.file)),
      );
      const r = await parser.parsePhoto(jpeg);
      const u = r.usage;
      tokens = `in ${u.input} out ${u.output} cache ${u.cacheRead}/${u.cacheCreation}`;
      cost += usageCost(u);
      if (r.kind === "items") {
        const kcal = Math.round(r.items.reduce((s, i) => s + i.kcal, 0));
        ok = c.kcalMax > 0 && kcal >= c.kcalMin && kcal <= c.kcalMax;
        verdict = `${r.items.length} items, ${kcal} kcal, ${ok ? "in" : "OUT OF"} range`;
      } else {
        ok = r.kind === "not_food" && c.kcalMin === 0 && c.kcalMax === 0;
        verdict = r.kind;
      }
    } catch (err) {
      verdict = `error: ${err instanceof Error ? err.name : "unknown"}`;
    }
    if (ok) pass++;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${c.file} | ${verdict} | ${tokens} | ${Date.now() - started} ms`,
    );
  }
  console.log(
    `\n${pass}/${ran} as expected. Estimated cost: $${cost.toFixed(4)} (${AI_MODEL})`,
  );
}

void main();
