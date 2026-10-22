# PR 10.2: 限流與監控 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 上線前加上依使用者與 IP 的限流、Cloud Monitoring 的 uptime／錯誤／延遲警示（寄 email），並寫好 Anthropic 用量上限的設定步驟。

**Architecture:**

- api：`@fastify/rate-limit`，計數放在記憶體。已登入（有效的 session token）用使用者 id 計算，其他用 IP 計算；`/health` 與 `/internal/*` 不限流。超過時回 429 `{error:"rate_limited"}`。Fastify 設 `trustProxy: 1`，取 Cloud Run 加上的最後一個 `X-Forwarded-For`。
- bot：webhook 依 LINE userId 在記憶體計數；超過時第一次回提醒，同一分鐘內之後的事件不處理。
- LIFF：429 時顯示「操作太頻繁，請稍等一分鐘再試。」
- log：api（pino）與 bot（Python logging）都輸出帶 `severity` 的 JSON，Cloud Logging 才能依嚴重程度篩選。
- infra：新檔 `infra/monitoring.tf`，內容包括 email 通知管道、`/health` uptime check、5xx 與 ERROR log 的錯誤警示、p95 延遲警示。
- Anthropic 用量上限由使用者在 Console 設定，步驟寫在 `infra/README.md`。

**Tech Stack:** 新增 `@fastify/rate-limit`（v11，支援 Fastify 5）；bot 不新增套件；Terraform `hashicorp/google ~> 8.0`。

**Spec:** [docs/specs/2026-10-15-gym-assistant-coach-design.md](../../specs/2026-10-15-gym-assistant-coach-design.md) §8.1（「依使用者與 IP 限流」）、§8.3（「Anthropic 用量上限」）、§8.4（「結構化 JSON log」「`/health` 端點；Cloud Monitoring 監控錯誤率與延遲」）、§10 PR 10。

**前一份計畫：** [2026-10-22-pr9-2-program-templates.md](2026-10-22-pr9-2-program-templates.md)。PR 10 切成 10.1（資料權利，另一個 session）、10.2（本計畫）、10.3（隱私權政策、負載與成本檢查、上線清單）。

## 已決定（2026-10-22，使用者同意）

1. **限流計數放記憶體**，每個 Cloud Run instance 各自計算（最多 3 個 instance，實際上限最多放寬到 3 倍）。不放 Neon（每個請求多一次查詢，還會叫醒休眠的 DB），不用 Cloud Armor（需要負載平衡器，約 US$18/月）。花錢的 AI 呼叫已經有 DB 裡的每日次數上限，限流只擋短時間爆量。
2. **api 規則**：已登入的使用者每人每分鐘 120 次；未登入（或 token 無效）每個 IP 每分鐘 30 次；`/health`、`/internal/*` 不限流（bot 的請求由 bot 端依使用者限流）。超過時回 429 `{error:"rate_limited"}`，LIFF 顯示「操作太頻繁，請稍等一分鐘再試。」
3. **bot 規則**：不做 IP 限流（webhook 都來自 LINE 伺服器，且已驗簽）。依 LINE userId 計算，每人每分鐘 20 個事件。超過時第一次回「訊息太多了，請稍等一分鐘再傳。」，同一分鐘內之後的事件不處理、不回覆。
4. **監控寫在新檔 `infra/monitoring.tf`**，monitoring API 也在這個檔案啟用，不改 `apis.tf`（避免和 10.1 衝突）。
   - 1 個 email 通知管道，寄到使用者提供的信箱。
   - api 與 bot 的 `/health` uptime check，每 15 分鐘、3 個區域。
   - 錯誤：任一服務 10 分鐘內 5 次以上 5xx（或 ERROR log）。流量小，所以用次數而不是比例。
   - 延遲：api p95 超過 20 秒、bot p95 超過 45 秒，持續 15 分鐘。
5. **警示信箱不進 git**：新變數 `alert_email` 沒有預設值。apply 時用 `TF_VAR_alert_email` 或本機的 `infra/alert.auto.tfvars`（加入 `.gitignore`）提供。信箱由使用者提供（已在對話中確認），只寫在使用者本機，本計畫與 repo 都不記錄。
6. **Anthropic 用量上限**：使用者在 Console 設每月 US$20 的上限，步驟寫在 `infra/README.md`。

## 規劃時的決定（實作細節，我替你做的）

1. **api 在 `onRequest` 就決定限流的 key**：`keyGenerator` 自己用 `verifySession` 驗 bearer token，成功是 `u:{userId}`，否則是 `ip:{req.ip}`。各路由的 `bearerAuth` 照舊。這樣不用動各個 plugin 不同的 `req.xxxUserId` 欄位。
2. **`apiErrorHandler` 保留 429**：目前所有 4xx 都會被換成 400 `bad_request`，必須先處理 429，回 `{error:"rate_limited"}` 並保留 `retry-after` header。
3. **`trustProxy: 1` 放在 `buildApp` 的預設值**（`Fastify({ trustProxy: 1, ...options })`），測試和正式環境用同一個設定。Cloud Run 會把真正的用戶端 IP 附在 `X-Forwarded-For` 最後；用戶端自己帶的值在前面，不會被採用。部署後用 log 確認一次（見「部署」）。
4. **api 的 log 加上 `severity`**：pino 的 `formatters.level` 把 `info`／`warn`／`error` 轉成 Cloud Logging 的 `INFO`／`WARNING`／`ERROR`。pino 預設輸出數字 `level`，Cloud Logging 讀不懂，ERROR log 警示會抓不到。
5. **bot 改成 JSON log**：bot 目前沒有設定 logging，WARNING 以上走 Python 的 lastResort 輸出成純文字。改成 stdout 的單行 JSON（`severity`、`message`、`logger`）。bot 的 webhook 即使處理失敗也回 200，所以 bot 的錯誤要靠 ERROR log 警示才看得到。
6. **bot 只計算 `MessageEvent` 與 `PostbackEvent`**。Follow／Unfollow 不計算也不擋（Unfollow 沒有 reply token，且必須處理才會標記退追）。沒有 userId 的事件（群組等）不計算。
7. **bot 限流用固定時間窗**：每個 userId 從第一個事件起算 60 秒；第 21 個事件回提醒，第 22 個起不處理。字典超過 1000 筆時清掉過期的。用 `threading.Lock`，因為 `_process` 跑在 threadpool。
8. **警示 policy 每個服務各一份**：uptime、錯誤、延遲 × api／bot，共 6 份。錯誤 policy 有兩個條件（5xx 次數、ERROR log 次數），任一個成立就警示（`combiner = "OR"`）。警示信件的 `documentation` 用繁體中文寫明是哪個服務、該看哪裡。
9. **uptime check 判斷內容**：`/health` 回 200 且內容含 `"status":"ok"`，逾時 10 秒（冷啟動約 1–3 秒）。3 個區域中有 2 個以上失敗才警示，避免單一區域網路問題誤報。
10. **Cloud Monitoring 的費用**：uptime check 每月約 2 × 3 × 2,880 = 17,280 次，在免費額度內；`/health` 不碰 DB，不會喚醒 Neon。警示條件可能有小額月費，部署前查官方價目（見「部署」）。

## Global Constraints

- 使用者看得到的文字一律是繁體中文，原樣使用：
  - LIFF 429：`操作太頻繁，請稍等一分鐘再試。`
  - bot 超過上限：`訊息太多了，請稍等一分鐘再傳。`
- api 限流常數（`apps/api/src/rate-limit.ts`）：`RATE_LIMIT_USER_MAX = 120`、`RATE_LIMIT_IP_MAX = 30`、`RATE_LIMIT_WINDOW_MS = 60_000`。
- bot 限流常數（`apps/bot/app/rate_limit.py`）：`USER_EVENT_LIMIT = 20`、`WINDOW_SECONDS = 60`。
- 429 回應：`{ "error": "rate_limited" }`，帶 `retry-after` header。
- 警示門檻：5xx 或 ERROR log 在 10 分鐘內大於 4 次；api p95 大於 20000 ms、bot p95 大於 45000 ms，持續 900 秒；uptime check 每 `900s`，3 區域中 2 個以上失敗。
- log 不記使用者 ID、LINE userId、IP、訊息內容、token。限流觸發時只記一行 `rate limited`，包含路由與 key 的種類（`user`／`ip`），不記 key 本身。
- 警示信箱不寫進 repo；`infra/*.auto.tfvars` 加進 `.gitignore`。
- 不改 `infra/apis.tf`、`infra/variables.tf`（10.1 會改 infra，避免衝突）；新變數寫在 `infra/monitoring.tf`。
- 不要 stage `.claude/` 和 `skills-lock.json`。本機 lint 用 `npx eslint apps packages` 和 `npx prettier --check apps packages db .github docs`。

## Review Focus

1. **偽造 `X-Forwarded-For`**：攻擊者每次帶不同的 `X-Forwarded-For: 1.2.3.{n}`，Cloud Run 再把真實 IP 附在最後。限流 key 必須是最後一個 IP，換假 IP 也繞不過。（Task 2 測試）
2. **帶假 token 或過期 token 狂打**：token 驗證失敗時用 IP 計算、上限 30，不會變成「每個假 token 各 120 次」。（Task 2 測試）
3. **同一個 Wi-Fi／電信 NAT 後的多個使用者**：已登入的請求只看使用者，同 IP 的 A 用完額度，B 照常使用。（Task 2 測試）
4. **bot 被擋時漏掉退追**：使用者狂傳訊息後封鎖官方帳號，Unfollow 仍要處理（標記退追）。（Task 4 測試）
5. **一個 webhook 帶很多事件**：同一個請求有 25 個訊息事件時，前 20 個處理、第 21 個回提醒、其餘不處理，而且只回一次提醒。（Task 4 測試）

---

### Task 1: api 的 log 加上 severity

**Files:**

- Create: `apps/api/src/logging.ts`、`apps/api/test/logging.test.ts`
- Modify: `apps/api/src/server.ts`（`buildApp(deps, { logger: loggerOptions, disableRequestLogging: true })`）

**Interfaces:**

- Produces: `export const loggerOptions: FastifyLoggerOptions & { formatters: { level(label: string): { severity: string } } }`，其中 `level: "info"`。`trace`／`debug` → `DEBUG`，`info` → `INFO`，`warn` → `WARNING`，`error` → `ERROR`，`fatal` → `CRITICAL`。

- [ ] **Step 1: 寫失敗的測試** `apps/api/test/logging.test.ts`：用 `Fastify({ logger: { ...loggerOptions, stream } })` 寫一筆 `info` 和一筆 `error`，解析輸出的 JSON：`severity` 分別是 `"INFO"`、`"ERROR"`，而且沒有數字的 `level` 欄位。另外用 `buildApp`（比照 `timing.test.ts`）打一個會丟錯的請求，確認 `request failed with an internal error` 那行是 `"severity":"ERROR"`。
- [ ] **Step 2: 跑測試確認失敗**：`npm test -w @gac/api -- logging`，預期 FAIL（找不到 `../src/logging`）。
- [ ] **Step 3: 實作** `apps/api/src/logging.ts` 並在 `server.ts` 使用。
- [ ] **Step 4: 跑測試確認通過**：`npm test -w @gac/api && npm run typecheck -w @gac/api`。
- [ ] **Step 5: Commit**：`git add apps/api && git commit -m "feat(api): Cloud Logging severity in JSON logs"`

---

### Task 2: api 限流

**Files:**

- Create: `apps/api/src/rate-limit.ts`、`apps/api/test/rate-limit.test.ts`
- Modify: `apps/api/package.json`（`npm i @fastify/rate-limit@^11 -w @gac/api`）、`apps/api/src/app.ts`（`trustProxy: 1` 預設值；在 CORS 之前註冊限流）、`apps/api/src/http.ts`（`apiErrorHandler` 處理 429）、`packages/shared/src/auth.ts`（`ApiError` 加 `"rate_limited"`）
- Test: `apps/api/test/health.test.ts`（不需修改，確認照舊通過）

**Interfaces:**

- Consumes: `verifySession(secret, token)`（`apps/api/src/auth/session.ts`）、`extractBearer(req)`（`apps/api/src/http.ts`）。
- Produces:
  - `export const RATE_LIMIT_USER_MAX = 120; RATE_LIMIT_IP_MAX = 30; RATE_LIMIT_WINDOW_MS = 60_000;`
  - `export function rateLimitOptions(sessionSecret: Uint8Array): RateLimitPluginOptions`：`keyGenerator` 是 async，回傳 `u:{userId}` 或 `ip:{req.ip}`；`max: (req, key) => key.startsWith("u:") ? RATE_LIMIT_USER_MAX : RATE_LIMIT_IP_MAX`；`timeWindow: RATE_LIMIT_WINDOW_MS`；`allowList` 放行 `routeOptions.url === "/health"` 和以 `/internal/` 開頭的路由；`onExceeded` 記一行 `rate limited`（`route`、`keyKind`）。
  - `@gac/shared` 的 `ApiError["error"]` 多了 `"rate_limited"`（Task 3 會用到）。

- [ ] **Step 1: 寫失敗的測試** `apps/api/test/rate-limit.test.ts`（用 `buildApp` 和既有的測試 deps；session 用 `issueSession` 產生）：
  - 同一個 IP 未登入打 `GET /me` 31 次：前 30 次是 401，第 31 次是 429，body 是 `{ error: "rate_limited" }`，有 `retry-after` header。
  - 換另一個 IP，第 1 次是 401（不受影響）。
  - `X-Forwarded-For: 1.2.3.{n}, 5.6.7.8`，n 每次不同，共 31 次，第 31 次仍是 429（只看最後一個 IP）。
  - 用無效 token（`Bearer nope`）打 31 次，第 31 次是 429（用 IP 計算）。
  - 使用者 A 從 IP X 打 `GET /me` 121 次，第 121 次是 429；使用者 B 從同一個 IP X 打第 1 次是 200。
  - `GET /health` 打 200 次全部 200；`/internal/*`（用既有測試的 service token 做法）打 40 次都不是 429。
- [ ] **Step 2: 跑測試確認失敗**：`npm test -w @gac/api -- rate-limit`，預期 FAIL。
- [ ] **Step 3: 實作**限流 options、在 `buildApp` 註冊、`apiErrorHandler` 在 4xx 分支之前處理 `status === 429`。
- [ ] **Step 4: 跑測試確認通過**：`npm test --workspaces --if-present && npm run typecheck --workspaces --if-present`。既有的測試照舊通過，沒有任何一個測試意外打到 429。
- [ ] **Step 5: Commit**：`git add apps/api packages/shared package-lock.json && git commit -m "feat(api): per-user and per-IP rate limit"`

---

### Task 3: LIFF 顯示限流訊息

**Files:**

- Modify: `apps/liff/src/api.ts`、`apps/liff/src/App.tsx`、`apps/liff/src/pages/Profile.tsx`、`apps/liff/src/pages/BodyMetrics.tsx`、`apps/liff/src/pages/meal/FoodSearch.tsx`、`apps/liff/src/pages/meal/MealEdit.tsx`、`apps/liff/src/pages/workout/FinishSummary.tsx`、`apps/liff/src/pages/workout/WorkoutHome.tsx`、`apps/liff/src/pages/workout/ExercisePicker.tsx`、`apps/liff/src/pages/workout/ActiveWorkout.tsx`、`apps/liff/src/pages/workout/EquipmentPhoto.tsx`
- Test: `apps/liff/src/api.test.ts`、`apps/liff/src/pages/workout/EquipmentPhoto.test.tsx`、`apps/liff/src/App.test.tsx`

**Interfaces:**

- Produces（`apps/liff/src/api.ts`）：
  - `export const RATE_LIMITED_MESSAGE = "操作太頻繁，請稍等一分鐘再試。";`
  - `export function failureMessage(err: unknown, fallback: string): string`：`err` 是 status 429 的 `ApiHttpError` 時回 `RATE_LIMITED_MESSAGE`，否則回 `fallback`。

- [ ] **Step 1: 寫失敗的測試**：
  - `api.test.ts`：`failureMessage(new ApiHttpError(429), "x")` 是 `RATE_LIMITED_MESSAGE`；`ApiHttpError(500)` 和一般 `Error` 回 `"x"`。
  - `EquipmentPhoto.test.tsx`：API 回 429 時畫面顯示「操作太頻繁，請稍等一分鐘再試。」，而不是「AI 暫時忙不過來，請稍後再試。」
  - `App.test.tsx`：開啟時 API 回 429，畫面顯示限流訊息，而不是「連線出了點問題，請稍後再試。」
- [ ] **Step 2: 跑測試確認失敗**：`npm test -w @gac/liff`，預期 FAIL。
- [ ] **Step 3: 實作**：每個顯示一般失敗文字的地方（上面 Files 列的檔案；用 `grep -rn "稍後再試\|再試一次" apps/liff/src` 找）改成 `failureMessage(err, 原本的文字)`。400、404 等原本有特別處理的分支不動。
- [ ] **Step 4: 跑測試確認通過**：`npm test -w @gac/liff && npm run typecheck -w @gac/liff`。
- [ ] **Step 5: Commit**：`git add apps/liff && git commit -m "feat(liff): show rate-limited message on 429"`

---

### Task 4: bot 的 JSON log 與依使用者限流

**Files:**

- Create: `apps/bot/app/rate_limit.py`、`apps/bot/app/logging_setup.py`、`apps/bot/tests/test_rate_limit.py`、`apps/bot/tests/test_logging_setup.py`
- Modify: `apps/bot/app/handlers.py`（`_Deps` 加 `limiter`；`_process` 在 `_handle_event` 前檢查；`create_app` 加參數 `limiter: UserRateLimiter | None = None`）、`apps/bot/app/messages.py`（`rate_limited()`）、`apps/bot/app/main.py`（啟動時呼叫 `configure_logging()`）
- Test: `apps/bot/tests/test_webhook.py`、`apps/bot/tests/test_messages.py`

**Interfaces:**

- Produces:
  - `rate_limit.py`：`USER_EVENT_LIMIT = 20`、`WINDOW_SECONDS = 60`；`class UserRateLimiter(limit: int = USER_EVENT_LIMIT, window_seconds: float = WINDOW_SECONDS, now: Callable[[], float] = time.monotonic)`，方法 `check(user_id: str) -> Literal["ok", "warn", "drop"]`：時間窗內第 1–20 個事件回 `"ok"`，第 21 個回 `"warn"`，之後回 `"drop"`。
  - `messages.rate_limited() -> TextMessage`，文字是 `訊息太多了，請稍等一分鐘再傳。`
  - `logging_setup.configure_logging(stream: TextIO = sys.stdout) -> None`：設定 root logger 的 level 為 INFO，輸出單行 JSON `{"severity", "message", "logger"}`；`WARNING` → `"WARNING"`，`ERROR` → `"ERROR"`，`CRITICAL` → `"CRITICAL"`。重複呼叫不會加第二個 handler。

- [ ] **Step 1: 寫失敗的測試**：
  - `test_rate_limit.py`：前 20 次 `"ok"`、第 21 次 `"warn"`、第 22 次 `"drop"`；另一個 userId 不受影響；假時鐘前進 60 秒後回到 `"ok"`；塞 1001 個過期的 userId 後，字典會被清掉。
  - `test_logging_setup.py`：`logging.getLogger("gac.bot").error("api error event=%s", "message")` 輸出一行 JSON，`severity == "ERROR"`、`message == "api error event=message"`；呼叫兩次 `configure_logging` 只輸出一行。
  - `test_webhook.py`（`create_app(..., limiter=UserRateLimiter(now=fake_clock))`）：
    - 同一個使用者 21 個文字訊息分 21 個 webhook 送：前 20 個照常處理，第 21 個回 `訊息太多了，請稍等一分鐘再傳。`，第 22 個不回覆、不呼叫 api。
    - 一個 webhook 帶 25 個同一使用者的訊息事件：只回一次提醒，api 只被呼叫 20 次的量。
    - 被擋的使用者送 Unfollow：仍呼叫 `mark_unfollowed`（依現有 fake 的方法名稱）。
    - 另一個使用者同時傳訊息不受影響；假時鐘前進 60 秒後同一使用者恢復處理。
  - `test_messages.py`：`rate_limited()` 的文字和 Global Constraints 一致。
- [ ] **Step 2: 跑測試確認失敗**：`cd apps/bot && uv run pytest -q`，預期 FAIL。
- [ ] **Step 3: 實作**。被擋時記一行 `logger.info("rate limited event=%s", event.type)`，不記 userId。
- [ ] **Step 4: 跑測試確認通過**：`cd apps/bot && uv run pytest -q && uv run ruff check . && uv run ruff format --check .`。
- [ ] **Step 5: Commit**：`git add apps/bot && git commit -m "feat(bot): JSON logs and per-user rate limit"`

---

### Task 5: Cloud Monitoring 警示（Terraform）

**Files:**

- Create: `infra/monitoring.tf`、`infra/tests/monitoring.tftest.hcl`
- Modify: `.gitignore`（加 `infra/*.auto.tfvars`）、`infra/tests/budget.tftest.hcl` 與 `infra/tests/core.tftest.hcl`（`variables` 加 `alert_email = "alerts@example.com"`）、`infra/README.md`（新增「監控與警示」一節）

**Interfaces:**

- Consumes: `local.run_services`、`local.api_url`、`local.bot_url`（`infra/run.tf`）、`var.project_id`。
- Produces（都在 `infra/monitoring.tf`）：
  - `variable "alert_email"`：`type = string`，沒有預設值，`validation` 用 `can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))`。
  - `google_project_service.monitoring`（`for_each = toset(["monitoring", "logging"])`，`disable_on_destroy = false`）。
  - `google_monitoring_notification_channel.email`：`type = "email"`，`labels.email_address = var.alert_email`。
  - `google_monitoring_uptime_check_config.health`（`for_each = local.run_services`）：`http_check { path = "/health", port = 443, use_ssl = true, validate_ssl = true }`，`monitored_resource { type = "uptime_url", labels = { project_id, host = 服務的 run.app 主機名稱 } }`，`period = "900s"`，`timeout = "10s"`，`selected_regions = ["ASIA_PACIFIC", "USA_OREGON", "EUROPE"]`，`content_matchers { content = "\"status\":\"ok\"" }`。
  - `google_logging_metric.errors`（`for_each = local.run_services`）：名稱 `${each.key}_error_logs`，filter `resource.type="cloud_run_revision" AND resource.labels.service_name="${each.key}" AND severity>=ERROR`，`DELTA`／`INT64`。
  - `google_monitoring_alert_policy.uptime`、`.errors`、`.latency`（各 `for_each = local.run_services`）：
    - uptime：metric `monitoring.googleapis.com/uptime_check/check_passed`，filter 指定該服務的 `check_id`；`alignment_period = "1200s"`、`ALIGN_NEXT_OLDER`、`REDUCE_COUNT_FALSE`、依 `resource.label.host` 分組；`COMPARISON_GT` 1；`duration = "0s"`。
    - errors（`combiner = "OR"`）：條件一 `run.googleapis.com/request_count`，`metric.labels.response_code_class="5xx"`；條件二 `logging.googleapis.com/user/${each.key}_error_logs`。兩個都用 `alignment_period = "600s"`、`ALIGN_SUM`、`REDUCE_SUM`，`COMPARISON_GT` 4，`duration = "0s"`。
    - latency：`run.googleapis.com/request_latencies`，`alignment_period = "300s"`、`ALIGN_PERCENTILE_95`，`COMPARISON_GT` `local.latency_p95_ms[each.key]`（api 20000、bot 45000），`duration = "900s"`。
    - 全部：`notification_channels = [google_monitoring_notification_channel.email.id]`，`alert_strategy { auto_close = "1800s" }`，`documentation` 用繁體中文寫服務名稱和要看的地方（Cloud Run 的 log、`/health`）。

- [ ] **Step 1: 寫失敗的測試** `infra/tests/monitoring.tftest.hcl`（`command = plan`，mock provider 比照 `budget.tftest.hcl`；用 `override_resource` 給通知管道一個固定 id）：
  - 通知管道 `type == "email"`、`labels.email_address == "alerts@example.com"`。
  - uptime check 的 key 正好是 `api`、`bot`；path 是 `/health`；`period == "900s"`；host 是 `api-…run.app`／`bot-…run.app`。
  - log metric 的 filter 含有 `severity>=ERROR` 和該服務名稱。
  - latency 門檻：api 20000、bot 45000；`duration == "900s"`。
  - errors 的兩個條件門檻都是 4、`combiner == "OR"`。
  - 6 份 policy 的 `notification_channels` 都包含通知管道的 id。
  - 另一個 `run`：`alert_email = "not-an-email"`，`expect_failures = [var.alert_email]`。
- [ ] **Step 2: 跑測試確認失敗**：`terraform -chdir=infra init -backend=false && terraform -chdir=infra test`，預期 FAIL。
- [ ] **Step 3: 實作** `infra/monitoring.tf`，修改兩個既有測試的 `variables`、`.gitignore`。`infra/README.md` 新增一節「監控與警示」，寫明三件事：
  - 在 `infra/alert.auto.tfvars` 寫 `alert_email = "…"`（不進 git），或 `export TF_VAR_alert_email=…`。
  - 執行 `terraform -chdir=infra apply`。
  - 收到警示信時要看哪裡。
- [ ] **Step 4: 跑測試確認通過**：`terraform fmt -check -recursive infra && terraform -chdir=infra validate && terraform -chdir=infra test`。
- [ ] **Step 5: Commit**：`git add .gitignore infra && git commit -m "feat(infra): uptime, error and latency alerts"`

---

### Task 6: Anthropic 用量上限步驟、收尾檢查與計畫備註

**Files:**

- Modify: `infra/README.md`（新增「Anthropic 用量上限」一節）、`docs/superpowers/plans/2026-10-22-pr10-2-rate-limit-monitoring.md`（狀態、交接備註、下一個 PR 需要知道的事）

- [ ] **Step 1: 在 `infra/README.md` 寫 Anthropic 用量上限步驟**（標「【使用者自行操作】」）：
  1. 登入 <https://console.anthropic.com>，到 **Settings → Limits**。
  2. 在每月花費上限（spend limit）設 **US$20**（估算每個活躍使用者約 US$0.2/月，約 100 人的量）。若專案用的是獨立 workspace，也可以在 **Settings → Workspaces →（該 workspace）→ Limits** 設同樣的上限。
  3. 若有用量通知（email notification）選項，設在 US$10。
  4. 超過上限時 Anthropic 會拒絕請求。api 會回「AI 暫時忙不過來」，使用者其他功能照常。要恢復，就調高上限或等下個月。
  5. 實際選單名稱以 Console 畫面為準。設定完在 PR 留言回報「已設定」。
- [ ] **Step 2: 全部檢查**：`npm test --workspaces --if-present`、`npm run typecheck --workspaces --if-present`、`npx eslint apps packages`、`npx prettier --check apps packages db .github docs`、`cd apps/bot && uv run pytest -q && uv run ruff check . && uv run ruff format --check .`、`terraform fmt -check -recursive infra && terraform -chdir=infra test`，全部通過。
- [ ] **Step 3: 更新本計畫的「狀態」「交接備註」「下一個 PR 需要知道的事」**，寫下實作時和計畫不同的地方。
- [ ] **Step 4: Commit**：`git add infra/README.md docs/superpowers/plans/2026-10-22-pr10-2-rate-limit-monitoring.md && git commit -m "docs: PR 10.2 Anthropic limit steps and plan notes"`

---

## 部署

- 不需要 migration。不新增 Cloud Run 的環境變數。
- 合併前，部署前先做：
  1. 查 [Cloud Monitoring 價目](https://cloud.google.com/stackdriver/pricing)，確認 6 份 policy（8 個條件）、2 個 uptime check、2 個 log-based metric 每月的費用。若會超過 NT$30/月，先回報再決定是否把 uptime 和錯誤合併。
- 合併後（CI 部署 api、bot、LIFF）：
  1. **【使用者自行操作】** 在 `infra/alert.auto.tfvars` 寫入 `alert_email = "<你的警示信箱>"`，然後執行 `terraform -chdir=infra apply`。plan 應該只有新增項目：2 個 API 啟用、1 個通知管道、2 個 uptime check、2 個 log metric、6 份 policy。不應該有任何修改或刪除。
  2. 到 Cloud Logging 看 api 的 `request timing`：確認有 `severity: INFO`。bot 的 log 也是 JSON。
  3. 確認 IP 來源：在本機用 `curl -H "X-Forwarded-For: 9.9.9.9" https://api-…run.app/me` 連打 31 次，第 31 次是 429。接著換成 `X-Forwarded-For: 8.8.8.8` 立刻再打一次，仍是 429。這表示限流用的是 Cloud Run 附上的真實 IP，不是請求自帶的值。
  4. 到 Cloud Monitoring → Uptime checks，確認 api、bot 兩個 check 都是綠燈。到 Alerting 確認 6 份 policy 都已啟用。
  5. 測試通知：在 Alerting → Notification channels 對 email 管道按「Send test notification」，確認信箱收到。
  6. 用手機在 LINE 一分鐘內連傳 21 則以上訊息（例如重複貼上「體重 70」），確認第 21 則收到「訊息太多了，請稍等一分鐘再傳。」，之後沒有回覆；一分鐘後恢復。
- **【使用者自行操作】** Anthropic 用量上限：照 `infra/README.md` 的步驟設定，在 PR 留言回報。

## 狀態

- 2026-10-22：計畫完成，待使用者確認。
- 2026-10-23：Task 1–6 實作完成（分支 `pr10-2-rate-limit-monitoring`，尚未 push、尚未開 PR）。全部檢查通過：`npm test --workspaces`、`typecheck`、`eslint`、`prettier`、bot 的 `pytest`／`ruff`、`terraform fmt`／`test`（6 個 run 全過）。部署步驟（`terraform apply`、Anthropic 上限）都還沒做。

## 交接備註

- 警示信箱只存在使用者本機的 `infra/alert.auto.tfvars` 或環境變數。換電腦 apply 時要重新提供，否則 Terraform 會要求輸入 `alert_email`。
- 限流計數在記憶體：instance 重啟或縮到 0 時計數歸零；最多 3 個 instance 時，實際上限最多是 3 倍。這是刻意的取捨，不是 bug。
- bot 的 webhook 處理失敗仍回 200（避免 LINE 重送），所以 bot 的 5xx 警示幾乎不會觸發，主要靠 ERROR log 警示。
- `infra/tests/budget.tftest.hcl` 與 `core.tftest.hcl` 加了 `alert_email` 變數；10.1 若也改這兩個檔，合併時可能有小衝突（只是 `variables` 區塊多一行）。
- 實作時和計畫不同的地方：
  - **限流 hook 掛在 root 的 `onRequest`**，不是 plugin 預設的每個路由 hook。plugin 的 hook 會排在路由自己的 `onRequest`（`bearerAuth`）之後，未登入或假 token 的請求在 401 就結束，永遠不會被計數。現在用 `global: false` 註冊 plugin，再在 `app.after()` 裡 `app.addHook("onRequest", app.rateLimit())`。副作用：找不到路由（404）的請求也依 IP 計算。
  - **`trustProxy` 寫成函式** `(_addr, hop) => hop < 1`，意思與 `trustProxy: 1` 相同（只信任 socket 那一跳，取 `X-Forwarded-For` 最後一個）。Fastify 的型別不接受數字。
  - **`allowList` 多放行 `/jobs/*`**（協調者決定）：10.1 的 Cloud Scheduler 端點是 `POST /jobs/daily`（OIDC），不在 `/internal` 底下。測試用假的 `/jobs/daily` 路由（打 40 次都不是 429），另有 `/jobsx` 對照組會被擋，也直接測 `allowList` 函式。
  - `session-routes.test.ts` 同一個使用者在同一個 app 打超過 120 次，改成每個測試重建 app（`beforeEach`）。其他既有測試不用改。
  - LIFF：`onFatal` 改成 `(err?: unknown) => void`，App 把錯誤存起來，錯誤畫面用 `failureMessage(err, "連線出了點問題，請稍後再試。")`。為了讓「開啟時 429」顯示限流訊息，`Records.tsx`、`meal/MealsCard.tsx` 也改成把錯誤傳給 `onFatal`（計畫的 Files 沒列這兩個）。`EquipmentPhoto.tsx` 原本就有一個叫 `failureMessage` 的本地函式，改名為 `photoFailureMessage`，最後再呼叫共用的 `failureMessage`。`ActiveWorkout` 的 409 訊息照舊優先。
  - bot：`messages.rate_limited()` 回傳 `Message`（dict），和其他訊息函式一致，不是 `TextMessage`。`rate limited event=…` 只在第 21 個事件（回提醒時）記一行，之後被丟掉的事件不記，避免洗版。`create_app` 用 `limiter if limiter is not None else UserRateLimiter()`：`UserRateLimiter` 有 `__len__`，空的時候是 falsy，不能用 `or`。
  - bot 的 JSON log 用 Python 的 level 名稱當 `severity`（INFO／WARNING／ERROR／CRITICAL 與 Cloud Logging 一致）；DEBUG 不輸出（root level 是 INFO）。
  - `infra/README.md`：「監控與警示」是第 10 節，「Anthropic 用量上限」是第 11 節。
- **Cloud Monitoring 費用（2026-10-23 查詢，未完全確認）**：官方價目頁 <https://cloud.google.com/stackdriver/pricing>（及 <https://cloud.google.com/products/observability/pricing>）是動態載入，抓不到全文，只能從搜尋結果的摘要得知：
  - uptime check：每個專案每月前 100 萬次免費，之後每 1,000 次 US$0.30。本 PR 每月約 17,280 次，免費。
  - 警示：目前的摘要寫每個警示條件每月 US$0.10，另外依條件回傳的 time series 數量收費；較舊的摘要寫每個 metric 參照每月 US$0.35。兩種說法的生效日期不一致。
  - 以 US$0.10 計，8 個條件約 US$0.80／月（約 NT$26），低於 NT$30 的門檻，但很接近；time series 的費用（流量小，series 少）沒查到確切數字。log-based metric 與 log 量很小，應在免費額度內（未確認）。
  - **apply 前請使用者打開價目頁確認一次**；若會超過 NT$30／月，可以把 uptime 和錯誤合併，或拿掉延遲警示（少 2 個條件）。

## 下一個 PR 需要知道的事

- **10.1（資料權利）**：Cloud Scheduler 的 `POST /jobs/daily`（OIDC）已經在 `rateLimitOptions` 的 `allowList` 裡（`/health`、`/internal/*`、`/jobs/*` 都不限流），10.1 不用改限流。測試用的是假路由，合併 10.1 後真的路由一樣適用；若 10.1 的路徑不是 `/jobs/` 開頭，要加進 `allowList`。排程失敗會寫 ERROR log，api 的錯誤警示會一起抓到，不用另外設警示。10.1 若也改 `infra/tests/*.tftest.hcl` 的 `variables`，記得保留 `alert_email = "alerts@example.com"`。
- **10.3（負載與成本檢查）**：
  - 負載測試若用同一個使用者或同一個 IP，會在每分鐘 120／30 次被 429 擋下。要用多個測試使用者，或分散 IP。
  - 成本檢查時一併確認 Cloud Monitoring 的實際費用。
  - 上線清單加上「警示 email 收得到」「Anthropic 用量上限已設定」兩項。
