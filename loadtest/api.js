// k6 load test for the api with fake AI (apps/api/src/loadtest-server.ts).
// Procedure and results: docs/launch/load-test.md. Never point this at the
// production api: it needs the load-test server's fake verifiers.
//
//   k6 run -e BASE_URL=https://api-loadtest-….run.app -e INTERNAL_TOKEN=… loadtest/api.js
//
// Environment:
//   BASE_URL        api-loadtest URL (no trailing slash)
//   INTERNAL_TOKEN  the service's LOADTEST_INTERNAL_TOKEN
//   USERS           fake users in the steady rotation (default 200)
//   STEADY_SECONDS  length of the steady scenario (default 300)
//   RUN             4 hex digits mixed into the LINE ids so each run gets
//                   fresh users and fresh daily AI counts (default random)
import http from "k6/http";
import exec from "k6/execution";
import { check, fail, sleep } from "k6";
import { Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL;
const INTERNAL_TOKEN = __ENV.INTERNAL_TOKEN;
const USERS = Number(__ENV.USERS || 200);
const STEADY_SECONDS = Number(__ENV.STEADY_SECONDS || 300);
const RUN = (
  __ENV.RUN ||
  Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, "0")
).slice(0, 4);
// Must equal CONSENT_VERSION in packages/shared/src/auth.ts.
const CONSENT_VERSION = __ENV.CONSENT_VERSION || "2026-10-23";
// Must equal FAKE_LINE_TOKEN_PREFIX in apps/api/src/loadtest/fakes.ts.
const FAKE_LINE_TOKEN_PREFIX = "loadtest:";
// Daily text-meal limit is 20 (AI_DAILY_LIMITS in packages/shared/src/meals.ts).
const LIMIT_CALLS = 25;

const MEAL_JPEG = open("./fixtures/meal.jpg", "b");

const expectedLimits = new Counter("expected_limits");
const unexpectedOutcomes = new Counter("unexpected_outcomes");

export const options = {
  setupTimeout: "10m",
  scenarios: {
    steady: {
      executor: "constant-vus",
      vus: 20,
      duration: `${STEADY_SECONDS}s`,
      exec: "steady",
      tags: { expected_limit: "false" },
    },
    limits: {
      executor: "shared-iterations",
      vus: 1,
      iterations: 1,
      startTime: `${STEADY_SECONDS + 30}s`,
      exec: "limits",
      tags: { expected_limit: "true" },
    },
  },
  thresholds: {
    "http_req_duration{ai:false}": ["p(95)<800"],
    "http_req_duration{ai:true}": ["p(95)<3500"],
    "http_req_failed{expected_limit:false}": ["rate<0.01"],
    unexpected_outcomes: ["count==0"],
  },
};

// "U" + 32 lowercase hex, the format the internal routes accept.
function lineId(i) {
  return `U10ad${RUN}${i.toString(16).padStart(24, "0")}`;
}

const json = { "Content-Type": "application/json" };
const bot = () => ({ ...json, Authorization: `Bearer ${INTERNAL_TOKEN}` });
const liff = (token) => ({ ...json, Authorization: `Bearer ${token}` });
const tags = (name, ai) => ({ name, ai: ai ? "true" : "false" });

function mustOk(res, what) {
  if (res.status < 200 || res.status >= 300) {
    fail(`${what}: HTTP ${res.status}`);
  }
  return res;
}

function createUser(i) {
  const lineUserId = lineId(i);
  mustOk(
    http.post(
      `${BASE_URL}/internal/users/sync`,
      JSON.stringify({ lineUserId, displayName: `壓測 ${i}` }),
      { headers: bot() },
    ),
    "sync",
  );
  mustOk(
    http.post(
      `${BASE_URL}/internal/users/consent`,
      JSON.stringify({ lineUserId, version: CONSENT_VERSION }),
      { headers: bot() },
    ),
    "consent",
  );
  const login = mustOk(
    http.post(
      `${BASE_URL}/auth/liff`,
      JSON.stringify({ idToken: `${FAKE_LINE_TOKEN_PREFIX}${lineUserId}` }),
      { headers: json },
    ),
    "auth/liff",
  );
  const token = login.json("accessToken");
  mustOk(
    http.put(
      `${BASE_URL}/profile`,
      JSON.stringify({
        sex: i % 2 ? "male" : "female",
        birthYear: 1990,
        heightCm: 170,
        weightKg: 70,
        activityLevel: "moderate",
        goal: "maintain",
      }),
      { headers: liff(token) },
    ),
    "profile",
  );
  return { lineUserId, token };
}

export function setup() {
  if (!BASE_URL || !INTERNAL_TOKEN) {
    fail("BASE_URL and INTERNAL_TOKEN are required");
  }
  if (!/^[0-9a-f]{4}$/.test(RUN)) fail("RUN must be 4 lowercase hex digits");
  const users = [];
  for (let i = 1; i <= USERS; i++) users.push(createUser(i));
  // User 0 is only for the limits scenario, outside the steady rotation.
  const limitUser = createUser(0);
  const exercises = mustOk(
    http.get(`${BASE_URL}/exercises?kind=strength`, {
      headers: liff(users[0].token),
    }),
    "exercises",
  ).json();
  return { users, limitUser, exerciseId: exercises[0].id };
}

function workout(user, exerciseId) {
  const h = { headers: liff(user.token) };
  const started = http.post(`${BASE_URL}/workouts`, "{}", {
    ...h,
    tags: tags("POST /workouts", false),
  });
  if (started.status !== 200) return;
  const id = started.json("id");
  http.post(
    `${BASE_URL}/workouts/${id}/items`,
    JSON.stringify({ exerciseId }),
    { ...h, tags: tags("POST /workouts/:id/items", false) },
  );
  http.put(
    `${BASE_URL}/workouts/${id}/sets`,
    JSON.stringify({ exerciseId, setIndex: 1, reps: 10, weightKg: 40 }),
    { ...h, tags: tags("PUT /workouts/:id/sets", false) },
  );
  http.post(`${BASE_URL}/workouts/${id}/finish`, "{}", {
    ...h,
    tags: tags("POST /workouts/:id/finish", false),
  });
}

/** An AI reply with the daily-limit outcome during steady means the rotation is too small. */
function expectOutcome(res, outcome) {
  const ok = check(res, {
    [`outcome ${outcome}`]: (r) =>
      r.status === 200 && r.json("outcome") === outcome,
  });
  if (res.status === 200) unexpectedOutcomes.add(ok ? 0 : 1);
}

export function steady(data) {
  const user = data.users[exec.scenario.iterationInTest % data.users.length];
  const { lineUserId, token } = user;

  http.post(
    `${BASE_URL}/internal/users/today`,
    JSON.stringify({ lineUserId }),
    {
      headers: bot(),
      tags: tags("POST /internal/users/today", false),
    },
  );
  http.get(`${BASE_URL}/workouts/week`, {
    headers: liff(token),
    tags: tags("GET /workouts/week", false),
  });
  http.put(
    `${BASE_URL}/body-metrics/today`,
    JSON.stringify({
      weightKg: Math.round((65 + Math.random() * 10) * 10) / 10,
    }),
    { headers: liff(token), tags: tags("PUT /body-metrics/today", false) },
  );
  expectOutcome(
    http.post(
      `${BASE_URL}/internal/meals/text`,
      JSON.stringify({ lineUserId, mealType: "lunch", text: "雞腿便當一個" }),
      { headers: bot(), tags: tags("POST /internal/meals/text", true) },
    ),
    "draft",
  );
  expectOutcome(
    http.post(
      `${BASE_URL}/internal/ai/ask`,
      JSON.stringify({ lineUserId, text: "今天要練什麼？" }),
      { headers: bot(), tags: tags("POST /internal/ai/ask", true) },
    ),
    "answer",
  );
  if (Math.random() < 0.3) {
    expectOutcome(
      http.post(`${BASE_URL}/internal/meals/photo`, MEAL_JPEG, {
        headers: {
          Authorization: `Bearer ${INTERNAL_TOKEN}`,
          "Content-Type": "application/octet-stream",
          "X-Line-User-Id": lineUserId,
        },
        tags: tags("POST /internal/meals/photo", true),
      }),
      "draft",
    );
  }
  if (Math.random() < 0.1) workout(user, data.exerciseId);

  sleep(3 + Math.random() * 2);
}

/** One user over the daily text-meal limit: the extra calls must answer "limit" (or 429). */
export function limits(data) {
  const { lineUserId } = data.limitUser;
  let limited = 0;
  for (let n = 0; n < LIMIT_CALLS; n++) {
    const res = http.post(
      `${BASE_URL}/internal/meals/text`,
      JSON.stringify({ lineUserId, mealType: "snack", text: "茶葉蛋一顆" }),
      { headers: bot(), tags: tags("POST /internal/meals/text (limit)", true) },
    );
    if (
      res.status === 429 ||
      (res.status === 200 && res.json("outcome") === "limit")
    ) {
      limited += 1;
      expectedLimits.add(1);
    }
  }
  check(limited, { "daily limit reached": (n) => n === LIMIT_CALLS - 20 });
}
