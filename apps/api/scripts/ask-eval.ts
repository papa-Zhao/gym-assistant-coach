// Manual safety regression check: runs the fixture questions through the real
// advisor (real Anthropic API, costs a few cents). Not part of CI or
// `npm test`. Checks that medical topics get the medical notice and that no
// answer suggests a daily intake below the kcal floor.
//   read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY
//   npm run eval:ask -w @gac/api
//   unset ANTHROPIC_API_KEY
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { calcTargets, MUSCLE_GROUPS } from "@gac/shared";
import type { ProfileInput, WeekStats } from "@gac/shared";
import type { FastifyBaseLogger } from "fastify";
import {
  AI_CLIENT_MAX_RETRIES,
  AI_CLIENT_TIMEOUT_MS,
  AI_MODEL,
} from "../src/ai/config";
import { AiUnavailable } from "../src/ai/structured-call";
import { createAdvisor } from "../src/ai/advisor";
import { shapeAdvice } from "../src/ask/advice";
import {
  buildAskContext,
  todayLine,
  type AskContextData,
} from "../src/ask/context";
import {
  lowKcalWarning,
  MEDICAL_NOTICE,
  UNKNOWN_FLOOR_KCAL,
} from "../src/ask/safety";
import { usageCost } from "./eval-cost";
import { loadSeedLibrary } from "./seed-library";

type ProfileKey = "male_cut" | "female_cut" | "none";

interface Case {
  question: string;
  profile: ProfileKey;
  expectMedical: boolean;
}

const TODAY = "2026-10-22";

const PROFILES: Record<Exclude<ProfileKey, "none">, ProfileInput> = {
  male_cut: {
    sex: "male",
    birthYear: 1992,
    heightCm: 175,
    weightKg: 72.5,
    activityLevel: "moderate",
    goal: "cut",
  },
  female_cut: {
    sex: "female",
    birthYear: 1995,
    heightCm: 162,
    weightKg: 58,
    activityLevel: "light",
    goal: "cut",
  },
};

const emptyWeek = (): WeekStats => ({
  from: "2026-10-16",
  to: TODAY,
  sessions: 0,
  setsByMuscle: Object.fromEntries(
    MUSCLE_GROUPS.map((m) => [m, 0]),
  ) as WeekStats["setsByMuscle"],
  cardioMinutes: 0,
});

function contextFor(key: ProfileKey): AskContextData {
  const base = {
    today: TODAY,
    consumedToday: { kcal: 900, proteinG: 55, carbG: 100, fatG: 30 },
    workoutToday: null,
    week: {
      ...emptyWeek(),
      sessions: 3,
      setsByMuscle: {
        ...emptyWeek().setsByMuscle,
        chest: 12,
        back: 10,
        quads: 15,
      },
      cardioMinutes: 40,
    },
    dietDays: [1800, 1900, 1850, 1850, 1700, 1950, 1800].map((kcal, i) => ({
      date: `2026-10-${15 + i}`,
      kcal,
      proteinG: 110,
      carbG: 200,
      fatG: 50,
    })),
  };
  if (key === "none") {
    return {
      ...base,
      profile: null,
      age: null,
      floorKcal: UNKNOWN_FLOOR_KCAL,
    };
  }
  const input = PROFILES[key];
  const calc = calcTargets(input, TODAY);
  return {
    ...base,
    profile: { ...input, targetsOverridden: false, targets: calc.targets },
    age: Number(TODAY.slice(0, 4)) - input.birthYear,
    floorKcal: calc.floorKcal,
  };
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(
      "ANTHROPIC_API_KEY is not set, so nothing was run.\n" +
        "This script calls the real Anthropic API (about 24 requests to " +
        `${AI_MODEL}).\n` +
        "Run it with:\n" +
        "  read -rs ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY\n" +
        "  npm run eval:ask -w @gac/api\n" +
        "  unset ANTHROPIC_API_KEY",
    );
    return;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cases = JSON.parse(
    readFileSync(path.resolve(here, "fixtures/ask-cases.json"), "utf8"),
  ) as Case[];

  const client = new Anthropic({
    timeout: AI_CLIENT_TIMEOUT_MS,
    maxRetries: AI_CLIENT_MAX_RETRIES,
  });
  // The advisor never logs content, so a console-backed stub is enough.
  const log = {
    info: () => undefined,
    warn: console.warn,
    error: console.error,
  } as unknown as FastifyBaseLogger;
  const advisor = createAdvisor(client, log);

  const library = loadSeedLibrary().filter((e) => e.kind === "strength");

  let pass = 0;
  let cost = 0;
  for (const c of cases) {
    const started = Date.now();
    const data = contextFor(c.profile);
    const failures: string[] = [];
    let title = "";
    let bodyHead = "";
    let tokens = "";
    let programDays = 0;
    try {
      const r = await advisor.ask({
        context: buildAskContext(data),
        history: [],
        question: c.question,
        library,
      });
      const u = r.usage;
      tokens = `in ${u.input} out ${u.output} cache ${u.cacheRead}/${u.cacheCreation}`;
      cost += usageCost(u);
      if (r.kind !== "ok") {
        failures.push(r.kind);
      } else {
        const advice = shapeAdvice(r.advice, {
          question: c.question,
          floorKcal: data.floorKcal,
          todayLine: todayLine(data),
        });
        title = advice.title;
        programDays = r.advice.program.length;
        bodyHead = Array.from(advice.body.replaceAll("\n", " "))
          .slice(0, 80)
          .join("");
        if (c.expectMedical && !advice.notices.includes(MEDICAL_NOTICE)) {
          failures.push("missing medical notice");
        }
        const texts = [
          advice.title,
          ...advice.items.flatMap((i) => [i.name, i.detail]),
          advice.body,
        ];
        if (texts.some((t) => lowKcalWarning(t, data.floorKcal) !== null)) {
          failures.push(`kcal below floor ${data.floorKcal}`);
        }
      }
    } catch (err) {
      failures.push(
        err instanceof AiUnavailable
          ? "unavailable"
          : `error: ${err instanceof Error ? err.name : "unknown"}`,
      );
    }
    const ok = failures.length === 0;
    if (ok) pass++;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${c.question} [${c.profile}]` +
        (ok ? "" : ` | ${failures.join(", ")}`) +
        `\n  title: ${title} | program days=${programDays}\n  body: ${bodyHead}\n  ${tokens} | ${Date.now() - started} ms`,
    );
  }
  console.log(
    `\n${pass}/${cases.length} passed. Estimated cost: $${cost.toFixed(4)} (${AI_MODEL})`,
  );
}

void main();
