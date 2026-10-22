// Manual regression check: runs your own gym equipment photos through the
// real pipeline (normalize + Anthropic identifier; real API, costs a few
// cents). Not part of CI or `npm test`. Nothing is uploaded anywhere and
// the AI's suggested names are not printed. No database is needed: the
// built-in list comes from the seed migration.
//   read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY
//   npm run eval:equipment-photo -w @gac/api -- <folder>
//   unset ANTHROPIC_API_KEY
// <folder>/cases.json:
//   [{ "file": "leg-press.jpg", "expectSlugs": ["leg-press"], "note": "..." }]
// Use expectSlugs: [] for a photo that is expected not to be equipment.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { FastifyBaseLogger } from "fastify";
import {
  AI_CLIENT_MAX_RETRIES,
  AI_CLIENT_TIMEOUT_MS,
  AI_MODEL,
} from "../src/ai/config";
import { createEquipmentIdentifier } from "../src/ai/equipment-identifier";
import { normalizePhoto } from "../src/photos/image";
import { shapeGuess } from "../src/workouts/identify";
import { usageCost } from "./eval-cost";
import { loadSeedLibrary } from "./seed-library";

interface Case {
  file: string;
  expectSlugs: string[];
  note?: string;
}

const USAGE =
  "Usage:\n" +
  "  read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY\n" +
  "  npm run eval:equipment-photo -w @gac/api -- <folder>\n" +
  "  unset ANTHROPIC_API_KEY\n" +
  '<folder> holds the photos and a cases.json like:\n  [{ "file": "leg-press.jpg", "expectSlugs": ["leg-press"], "note": "..." }]\n' +
  "Use expectSlugs: [] for a photo that is not gym equipment.";

function isCase(v: unknown): v is Case {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.file === "string" &&
    Array.isArray(c.expectSlugs) &&
    c.expectSlugs.every((s) => typeof s === "string")
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(casesPath, "utf8"));
  } catch {
    console.log(`cases.json is not valid JSON.\n${USAGE}`);
    return;
  }
  if (!Array.isArray(parsed) || !parsed.every(isCase)) {
    console.log(`cases.json has an invalid entry.\n${USAGE}`);
    return;
  }
  const cases: Case[] = parsed;

  const library = loadSeedLibrary();

  const client = new Anthropic({
    timeout: AI_CLIENT_TIMEOUT_MS,
    maxRetries: AI_CLIENT_MAX_RETRIES,
  });
  const log = {
    info: () => undefined,
    warn: console.warn,
    error: console.error,
  } as unknown as FastifyBaseLogger;
  const identifier = createEquipmentIdentifier(client, log);

  let pass = 0;
  let total = 0;
  let cost = 0;
  for (const c of cases) {
    total++;
    if (
      c.file.includes("/") ||
      c.file.includes("\\") ||
      c.file.includes("..")
    ) {
      console.log(`SKIP ${c.file} | file must be a plain name in the folder`);
      continue;
    }
    const started = Date.now();
    let verdict: string;
    let ok = false;
    let tokens = "";
    try {
      const jpeg = await normalizePhoto(
        readFileSync(path.join(folder, c.file)),
      );
      const r = await identifier.identify(jpeg, library);
      const u = r.usage;
      tokens = `in ${u.input} out ${u.output} cache ${u.cacheRead}/${u.cacheCreation}`;
      cost += usageCost(u);
      if (r.kind === "guess") {
        // Same shaping as production.
        const shaped = shapeGuess(r.guess, library);
        const candidates =
          shaped.outcome === "found"
            ? shaped.candidates.map((e) => e.slug)
            : [];
        ok =
          shaped.outcome === "not_equipment"
            ? c.expectSlugs.length === 0
            : c.expectSlugs.some((s) => candidates.includes(s));
        verdict =
          shaped.outcome === "found"
            ? `${shaped.equipment}, ${candidates.length} candidates`
            : shaped.outcome;
      } else {
        ok = r.kind === "not_equipment" && c.expectSlugs.length === 0;
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
    `\n${pass}/${total} as expected. Estimated cost: $${cost.toFixed(4)} (${AI_MODEL})`,
  );
}

main().catch((err: unknown) => {
  console.error(`error: ${err instanceof Error ? err.name : "unknown"}`);
  process.exitCode = 1;
});
