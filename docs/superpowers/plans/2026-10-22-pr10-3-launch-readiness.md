# PR 10.3: 上線前收尾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 隱私權政策與服務條款定稿（所有人重新同意一次）、用假 AI 做一次負載測試、寫出每月成本估算和上線檢查清單，做完就可以公開上線。

**Architecture:**

- 政策頁：改寫 `apps/liff/public/privacy.html`、`terms.html`（拿掉「草稿」、填好營運者與信箱、補齊個資法要寫的項目）。`CONSENT_VERSION` 改成定稿日期，`packages/shared` 和 `apps/bot` 兩邊一起改，現有流程會讓所有人重新同意。新增測試，確認兩邊的版本、頁面上的版本都一致，而且頁面沒有留下佔位。
- 負載測試：api 新增一個進入點 `src/loadtest-server.ts`，用現有的 `AppDeps` 注入假的 AI、照片儲存、LINE 驗證、bot 通知、服務帳號驗證，只有資料庫是真的。部署成**暫時的另一個 Cloud Run 服務 `api-loadtest`**（同一個 image，改啟動指令），連到 Neon 測試分支。k6 腳本 `loadtest/api.js` 走真實的登入流程建立 200 個假使用者，再模擬 LIFF 和 bot 的請求。測完就刪掉服務和分支。
- 文件：`docs/launch/load-test.md`（步驟與結果）、`docs/launch/cost-estimate.md`（200 人／1,000 人每月成本）、`docs/launch/checklist.md`（上線清單）。

**Tech Stack:** 現有套件；負載測試用 [k6](https://k6.io)（本機安裝的單一執行檔，不加進 npm 依賴）。

**Spec:** [docs/specs/2026-10-15-gym-assistant-coach-design.md](../../specs/2026-10-15-gym-assistant-coach-design.md) §4（同意紀錄版本）、§6.8（資料權利）、§7（成本粗估）、§8.2（隱私）、§8.3（成本控制）、§10 PR 10、§12 #4（網域）、#5（LINE 方案）。

**前一份計畫：** PR 10.1 資料權利、PR 10.2 限流與監控。本 PR 要等這兩個合併後才實作，依賴的地方列在「下一個 PR 需要知道的事」。

## 已決定（2026-10-22，使用者同意）

1. **政策改版後所有人重新同意。** `CONSENT_VERSION` 改成定稿日期；現有使用者下次互動時會看到同意卡片。之後的規則：內容有實質變更就改版本，只修錯字或排版不改。
2. **營運者寫「Papa Zhao」**（個人，沒有公司或行號），聯絡信箱用另外開的服務專用信箱，不放個人信箱。
3. **規模以上線後前 3 個月約 200 個活躍使用者估算**，另外列 1,000 人的情境；負載測試目標是同時 20 個使用者。
4. **網域現在不買**，上線清單只列購買與設定步驟，名稱上線前再決定。
5. 上線前請法律專業人士審閱政策與條款（列在清單上，不是本 PR 的完成條件）。

## 規劃時的決定（我替你做的，使用者已看過）

1. **負載測試工具用 k6**，門檻寫在腳本裡（見 Global Constraints），跑完直接顯示通過或失敗。
2. **不打 Anthropic、不碰正式資料**：假 AI 固定回傳並模擬延遲（預設 2 秒）；資料庫用 Neon 測試分支。
3. **只測 api**，不測 bot webhook，因為 bot 會呼叫 LINE 的 reply API。bot 打到 api 的路徑（`/internal/*`）由 k6 直接模擬。
4. **成本不寫死價格**：用 `ai_usage_daily` 實際記錄的 token 平均值，乘以執行當天 Anthropic 官網的 Haiku 5.5 價格。
5. **網域建議用 Cloudflare Registrar 購買**，只讓 LIFF 和政策頁走自訂網域（Firebase Hosting），api 維持 `run.app`。
6. **Anthropic 主控台每月上限訂在 200 人估算值的 2 倍**（無條件進位到 US$5 的倍數）。
7. 這些決定直接寫在本計畫，不另外寫設計文件。

## 規劃時的決定（實作細節，我替你做的）

1. **負載測試用另外一個暫時的服務，不用 api 的無流量 tagged revision。** 改變點：brainstorm 時提的是 tagged revision，但 `gcloud run deploy api --tag … --command …` 會改到 api 服務本身的設定，下一次 CI 部署（`gcloud run deploy api --image`）會沿用假 AI 的啟動指令和測試分支的連線字串，把正式流量切過去。另開 `api-loadtest` 服務就不會有這個問題，用完直接刪。
2. **假服務帳號驗證只接受一組固定的測試 token**（`LOADTEST_INTERNAL_TOKEN`，至少 32 bytes）；**假 LINE 驗證只接受 `loadtest:` 開頭的 ID token**，`sub` 就是後面那段。k6 透過 `/internal/users/sync`、`/internal/users/consent`、`/auth/liff` 建立使用者並取得 session，走的是真的流程。
3. **`loadtest-server` 在 `K_SERVICE=api` 時拒絕啟動**（Cloud Run 會把服務名稱放在 `K_SERVICE`），防止有人把假 AI 部署到正式服務。
4. **照片記餐用一張真的小 JPEG**（`loadtest/fixtures/meal.jpg`，約 100 KB），讓 `normalizePhoto`（sharp）的 CPU 成本算進去；假照片儲存什麼都不存。
5. **每次迭代輪流換使用者，並加 3–5 秒的思考時間**，讓每個假使用者的 AI 次數維持在每日上限以下（5 分鐘約 1,500 次迭代 ÷ 200 人 ≈ 每人 8 次）。另外跑一個小情境，故意讓同一個人超過上限，確認會回 429 或每日上限的回覆。
6. **政策頁照個資法第 8 條的告知項目寫**：營運者、蒐集目的、資料類別、利用期間／地區／對象／方式、當事人權利與行使方式、不提供的影響。資料存放地區寫新加坡（Cloud Run、Neon），AI 處理寫 Anthropic（美國）。Anthropic 是否用 API 資料訓練模型、保存多久，**要在實作當天查證 Anthropic 現行條款後才寫**，不憑記憶。
7. **重新同意沿用現有的同意卡片**（「歡迎使用…」），不另外做「條款已更新」版本。上線前只有測試帳號會看到。
8. 器材照片（`/exercises/identify`）只用來辨識、不儲存（已確認路由沒有用 `photoStore`）；政策頁照這樣寫。

## Global Constraints

- 使用者看得到的文字一律是繁體中文。
- 政策頁保存期限（原樣寫入）：餐點照片 90 天；問 AI 的對話與課表 90 天（`ASK_RETENTION_DAYS = 90`）；申請刪除後立即停用，7 天內實際刪除全部資料（含照片），只保留去識別化的每日 AI 用量總數；封鎖官方帳號只標記，不刪資料。
- 使用者權利（原樣寫入）：在 LIFF 設定頁匯出資料（JSON，不含照片）；刪除帳號，確認後立即生效、無法取消，LINE 帳號立刻與舊資料脫鉤，之後可以重新開始。
- 政策頁與條款頁不能留下 `[`、`]` 佔位，也不能有「草稿」字樣；頁面上的版本 `版本 {CONSENT_VERSION}` 必須和程式一致。
- 負載測試門檻：非 AI 請求 p95 < 800 ms；AI 請求（假 AI 延遲 2,000 ms）p95 < 3,500 ms；錯誤率（不含刻意觸發的 429）< 1%。
- 負載測試**絕對不能**用正式的 `ANTHROPIC_API_KEY`、正式資料庫或正式的 `SESSION_SECRET`。
- 機密在終端機用 `read -rs` 輸入，不寫進檔案、指令歷史或文件。
- 不要 stage `.claude/` 和 `skills-lock.json`。本機 lint 用 `npx eslint apps packages loadtest` 和 `npx prettier --check apps packages db .github docs loadtest`。

## Review Focus

1. **版本只改了一邊**：shared 改了、bot 沒改（或反過來），bot 送出的同意 postback 版本和 api 比對的版本不同，使用者按同意後仍然被要求同意，無限循環。（Task 1 一致性測試）
2. **假 AI 跑到正式環境**：`loadtest-server` 被部署到 `api` 服務，或正式的 `server.ts` 被改成可以切換假 AI。（Task 2 測試：`K_SERVICE=api` 拒絕啟動；`server.ts` 不 import `loadtest/`）
3. **假驗證被濫用**：`api-loadtest` 是公開的 URL，任何人都能打。假服務帳號驗證收到錯的 token、空字串、`Bearer` 以外的格式都要回 401；假 LINE 驗證收到不是 `loadtest:` 開頭的 token 要拒絕。（Task 2 測試）
4. **負載測試撞到限流就誤判失敗**：k6 從同一個 IP 打，10.2 的 IP 限流會擋下大部分請求。測試服務要用 10.2 的設定調高 IP 上限，結果報告要把刻意觸發的 429 和真的錯誤分開算。（Task 3）
5. **連線數爆掉**：3 個 instance × postgres pool `max: 5` = 15 條連線，Neon 免費方案要用 pooled 連線字串（`-pooler`）。負載測試要記錄有沒有 `too many connections`。（Task 3 結果）

---

### Task 1: 隱私權政策與服務條款定稿、同意版本

**Files:**

- Modify: `apps/liff/public/privacy.html`、`apps/liff/public/terms.html`、`packages/shared/src/auth.ts`（`CONSENT_VERSION`）、`apps/bot/app/settings.py`（`CONSENT_VERSION`）
- Create: `apps/liff/src/legal.test.ts`、`apps/api/test/consent-version.test.ts`
- Test: 現有的 `apps/api/test/internal.test.ts`、`apps/bot/tests/test_webhook.py`（若有寫死版本字串就跟著改）

**Interfaces:**

- Produces：`CONSENT_VERSION = "YYYY-MM-DD"`（定稿當天的日期），shared 和 bot 相同。
- 隱私權政策章節（依序）：1 營運者與聯絡方式；2 蒐集的資料（LINE userId 與顯示名稱、個人檔案（性別、出生年、身高、活動量、目標）、身體數據、訓練紀錄、飲食紀錄與餐點照片、器材照片（只辨識不儲存）、問 AI 的內容、AI 使用次數）；3 使用目的；4 資料存放地區與第三方處理（Google Cloud、Neon 在新加坡；Anthropic 處理照片、飲食文字、問 AI 內容與個人檔案摘要）；5 保存期限（Global Constraints 原文）；6 你的權利與行使方式（匯出、刪除、查詢；個資法第 3 條的權利）；7 不提供資料的影響（不同意就無法使用；沒有填個人檔案就無法計算目標）；8 政策變更（實質變更會請你重新同意）。
- 服務條款新增：服務免費、依現況提供；AI 內容可能不正確；每日使用次數與限流；年滿 18 歲；非醫療建議（保留）；條款變更會請你重新同意；準據法為中華民國法律。

- [ ] **Step 1: 跟使用者要服務專用信箱的地址**（還沒開就先請他開）。沒有地址就不要往下做。
- [ ] **Step 2: 查證 Anthropic 現行的商業條款與隱私說明**（API 資料是否用於訓練、保存期間），寫下來源網址與查證日期，放進 Task 5 的交接備註。
- [ ] **Step 3: 寫失敗的測試**
  - `legal.test.ts`（用 `node:fs` 讀 `public/privacy.html`、`public/terms.html`）：兩頁都含 `版本 ${CONSENT_VERSION}`；都不含 `[`、`]`、`草稿`；都含 `Papa Zhao` 與信箱；`privacy.html` 含 `90 天`、`7 天`、`Anthropic`、`JSON`、`無法取消`、`新加坡`。
  - `consent-version.test.ts`：讀 `apps/bot/app/settings.py`，用 `/^CONSENT_VERSION = "(.+)"$/m` 取出值，等於 shared 的 `CONSENT_VERSION`；值符合 `/^\d{4}-\d{2}-\d{2}$/`。
- [ ] **Step 4: 跑測試確認失敗**：`npm test -w @gac/liff -- legal`、`npm test -w @gac/api -- consent-version`，預期 FAIL（頁面還有草稿與佔位）。
- [ ] **Step 5: 改寫兩頁、更新兩邊的 `CONSENT_VERSION`。** 頁面樣式不動；`.draft` 區塊和它的 CSS 一起拿掉。
- [ ] **Step 6: 跑測試確認通過**：上面兩個測試，加上 `npm test -w @gac/api -- internal auth users-repo`、`cd apps/bot && uv run pytest -q`。
- [ ] **Step 7: 用瀏覽器打開兩頁**（`npm run dev -w @gac/liff` 後開 `/privacy.html`、`/terms.html`），手機寬度（375px）檢查排版。
- [ ] **Step 8: Commit**：`git add apps/liff/public apps/liff/src/legal.test.ts packages/shared/src/auth.ts apps/bot/app/settings.py apps/api/test/consent-version.test.ts apps/bot/tests && git commit -m "feat: finalize privacy policy and terms, bump consent version"`

---

### Task 2: 負載測試用的 api 進入點（假 AI）

**Files:**

- Create: `apps/api/src/loadtest/config.ts`、`apps/api/src/loadtest/fakes.ts`、`apps/api/src/loadtest-server.ts`、`apps/api/test/loadtest.test.ts`
- Modify: `apps/api/tsup.config.ts`（`entry` 加 `src/loadtest-server.ts`）

**Interfaces:**

- Produces（`loadtest/config.ts`）：
  ```ts
  export interface LoadtestConfig { port: number; databaseUrl: string; sessionSecret: Uint8Array; corsOrigin: string; internalToken: string; aiDelayMs: number }
  /** Throws when K_SERVICE is "api", a variable is missing, LOADTEST_INTERNAL_TOKEN or SESSION_SECRET is under 32 bytes, or FAKE_AI_DELAY_MS is outside 0–20000. Messages name variables only. */
  export function loadLoadtestConfig(env: NodeJS.ProcessEnv): LoadtestConfig;
  ```
  必要變數：`DATABASE_URL`、`SESSION_SECRET`、`CORS_ORIGIN`、`LOADTEST_INTERNAL_TOKEN`；`FAKE_AI_DELAY_MS` 預設 2000。10.2 若新增了限流設定，也一併讀進來（用 10.2 的變數名稱），讓測試服務可以調高 IP 上限。
- Produces（`loadtest/fakes.ts`）：
  ```ts
  export const LOADTEST_BOT_SA = "loadtest-bot@loadtest.invalid";
  export const FAKE_LINE_TOKEN_PREFIX = "loadtest:";
  export function createFakeDeps(opts: { internalToken: string; aiDelayMs: number }): Pick<AppDeps,
    "verifyServiceToken" | "botServiceAccount" | "verifyLineIdToken" | "notifyWorkoutFinished" |
    "mealParser" | "equipmentIdentifier" | "advisor" | "photoStore">;
  ```
  - `verifyServiceToken`：token 等於 `internalToken`（用 `crypto.timingSafeEqual`）才回 `{ email: LOADTEST_BOT_SA }`，否則 reject。
  - `verifyLineIdToken`：`loadtest:` 開頭且後面非空才回 `{ sub: 後段, name: "壓測 " + 後段 }`，否則 reject。
  - `mealParser.parseText`／`parsePhoto`、`advisor.ask`、`equipmentIdentifier.identify`：等 `aiDelayMs` 後回傳固定、型別合法的結果（餐點 2 個項目；問 AI 一段固定文字、不帶課表；器材辨識回第一個 library 動作），token 用量填固定值（input 1500、output 300），讓成本紀錄有東西。
  - `photoStore`：`put`／`delete` 不做事，`signedUrl` 回 `https://loadtest.invalid/photo.jpg`。
  - `notifyWorkoutFinished`：直接 resolve。
- `loadtest-server.ts`：照 `server.ts` 的寫法建 `postgres`（`max: 5`）＋ `buildApp`，deps 用 `createFakeDeps` 加真的 db；啟動時印一行 `LOADTEST SERVER: fake AI, do not route production traffic`。`server.ts` 不改。

- [ ] **Step 1: 寫失敗的測試**（`loadtest.test.ts`）
  - `loadLoadtestConfig`：`K_SERVICE: "api"` 丟錯；缺 `LOADTEST_INTERNAL_TOKEN` 丟錯且訊息只含變數名稱；token 31 bytes 丟錯；`FAKE_AI_DELAY_MS: "-1"`、`"20001"`、`"abc"` 丟錯；沒給時 `aiDelayMs === 2000`；`K_SERVICE: "api-loadtest"` 正常。
  - `verifyServiceToken`：正確 token 回 `LOADTEST_BOT_SA`；錯的 token、空字串、正確 token 多一個字元都 reject。
  - `verifyLineIdToken`：`"loadtest:u001"` 回 `sub: "u001"`；`"loadtest:"`、`"u001"`、真的 LINE ID token 格式字串都 reject。
  - 用 `createTestDb` + `buildApp` 接上 fake deps：`/internal/users/sync` → `/internal/users/consent` → `/auth/liff`（`idToken: "loadtest:u001"`）拿到 access token，再 `GET /me` 回 200；`/internal/meals/text` 回兩個項目；`/internal/ai/ask` 回固定文字。（`aiDelayMs: 0`）
  - 讀 `src/server.ts` 原始碼，不含 `loadtest`。
- [ ] **Step 2: 跑測試確認失敗**：`npm test -w @gac/api -- loadtest`，預期 FAIL（模組不存在）。
- [ ] **Step 3: 實作 `config.ts`、`fakes.ts`、`loadtest-server.ts`，tsup 加 entry。**
- [ ] **Step 4: 跑測試確認通過**：`npm test -w @gac/api -- loadtest`；`npm run build -w @gac/api` 後 `ls apps/api/dist` 有 `server.js` 和 `loadtest-server.js`；`npm run typecheck -w @gac/api`。
- [ ] **Step 5: Commit**：`git add apps/api/src/loadtest apps/api/src/loadtest-server.ts apps/api/tsup.config.ts apps/api/test/loadtest.test.ts && git commit -m "feat(api): load-test entry point with fake AI"`

---

### Task 3: k6 腳本、執行負載測試、記錄結果

**Files:**

- Create: `loadtest/api.js`、`loadtest/fixtures/meal.jpg`、`docs/launch/load-test.md`
- Modify: 根目錄的 ESLint 設定（只有在 `npx eslint loadtest` 抱怨 `k6/*` import 或 k6 全域變數時，才替 `loadtest/**` 加 override）

**Interfaces:**

- Consumes：Task 2 的 `FAKE_LINE_TOKEN_PREFIX`（k6 腳本寫死 `"loadtest:"`，註解指向 `fakes.ts`）、`LOADTEST_INTERNAL_TOKEN`。
- k6 環境變數：`BASE_URL`、`INTERNAL_TOKEN`、`USERS`（預設 200）。
- `setup()`：建立 `lt-001`…`lt-200`：sync → consent → `PUT /profile`（固定值）→ `/auth/liff` 拿 access token，回傳 token 陣列。
- 情境 `steady`：`constant-vus`，20 VUs，5 分鐘。每次迭代換下一個使用者，依序：`GET /internal/users/today`、`GET /workouts/week`、`POST /body-metrics`、`POST /internal/meals/text`、`POST /internal/ai/ask`；30% 的迭代多做 `POST /internal/meals/photo`（`meal.jpg`）；10% 的迭代做一次完整訓練（開始 → 加一個動作 → 記一組 → finish）。每次迭代結束 `sleep(3 + Math.random() * 2)`。請求體照各路由的 schema。
- 情境 `limits`（`steady` 結束後開始，1 VU）：同一個使用者連續 `POST /internal/meals/text` 25 次，用 tag `expected_limit: "true"` 標記，429 或每日上限回覆不算錯誤。
- 門檻（`options.thresholds`）：`http_req_duration{ai:"false"}: ["p(95)<800"]`、`http_req_duration{ai:"true"}: ["p(95)<3500"]`、`http_req_failed{expected_limit:"false"}: ["rate<0.01"]`。

- [ ] **Step 1: 寫 `loadtest/api.js`，先對本機跑一次**：需要真的 Postgres（PGlite 不支援多連線），所以用 Neon 測試分支（Step 2 第 1 點）加本機的 `node apps/api/dist/loadtest-server.js`，`USERS=5` 跑 `steady` 30 秒（`k6 run -e … --duration 30s`）確認腳本能跑完、沒有 4xx。
- [ ] **Step 2: 寫 `docs/launch/load-test.md` 的步驟**（以下指令都寫進文件）：
  1. Neon 主控台從 `main` 建分支 `loadtest-YYYYMMDD`，複製 **pooled** 連線字串，在測試分支跑 migration（`DATABASE_URL=… npm run db:migrate -w @gac/api`）。
  2. 用 `read -rs` 輸入測試分支連線字串，並各產生一組新的 `SESSION_SECRET`、`LOADTEST_INTERNAL_TOKEN`（`openssl rand -base64 48`）。
  3. 取最新的 api image（Artifact Registry 上 CI 推的那個），部署：`gcloud run deploy api-loadtest --image "$IMAGE" --region asia-southeast1 --command node --args dist/loadtest-server.js --cpu 1 --memory 512Mi --min-instances 0 --max-instances 3 --allow-unauthenticated --set-env-vars "DATABASE_URL=$LT_DB,SESSION_SECRET=$LT_SECRET,LOADTEST_INTERNAL_TOKEN=$LT_TOKEN,CORS_ORIGIN=https://loadtest.invalid"`（加上 10.2 的限流變數，把 IP 上限調高；cpu、memory、instance 數照 `infra/run.tf` 的 api 設定）。
  4. 量冷啟動：服務閒置 15 分鐘以上後，`curl -w '%{time_total}'` 打 `/health` 一次、再打一次需要資料庫的請求，各記錄時間。
  5. `k6 run -e BASE_URL=… -e INTERNAL_TOKEN=… loadtest/api.js`。
  6. 量資料量：在測試分支執行 `select pg_size_pretty(pg_database_size(current_database()))`，和建立分支時比較，算出每位使用者每次迭代的資料量。
  7. 清理：`gcloud run services delete api-loadtest --region asia-southeast1`、在 Neon 刪掉測試分支，確認兩者都不見。
- [ ] **Step 3: 照文件執行**（需要使用者的 gcloud 登入與 Neon 主控台；機密由使用者用 `read -rs` 輸入）。
- [ ] **Step 4: 把結果寫進 `load-test.md` 的「結果」段落**：k6 摘要（各門檻通過與否、p50／p95、錯誤數、429 數）、冷啟動時間、Cloud Run 最多開幾個 instance（Cloud Monitoring 的 instance count）、有沒有 `too many connections`、資料量。門檻沒過的話，寫下原因和建議（例如調 `max_instance_count` 或 pool 大小），**不在本 PR 改設定**，列進上線清單請使用者決定。
- [ ] **Step 5: 確認清理完成**：`gcloud run services list --region asia-southeast1` 只有 `api`、`bot`。
- [ ] **Step 6: Commit**：`git add loadtest docs/launch/load-test.md && git commit -m "test: k6 load test and results"`

---

### Task 4: 每月成本估算與上線檢查清單

**Files:**

- Create: `docs/launch/cost-estimate.md`、`docs/launch/checklist.md`

**Interfaces:**

- 成本估算的使用模型（寫在文件開頭）：活躍使用者每天 3 張照片、2 次文字記餐、2 次問 AI、0.5 次訓練完成通知（push）、每張照片約 150 KB；200 人和 1,000 人兩種情境。

- [ ] **Step 1: 取得每次 AI 呼叫的平均 token**：請使用者在 Neon SQL editor（正式分支，唯讀查詢）執行
  ```sql
  select kind, sum(count) as calls,
         sum(input_tokens)::float / sum(count) as avg_in,
         sum(output_tokens)::float / sum(count) as avg_out,
         sum(cache_read_tokens)::float / sum(count) as avg_cache_read,
         sum(cache_creation_tokens)::float / sum(count) as avg_cache_write
  from ai_usage_daily group by kind;
  ```
  （10.1 若把用量搬到去識別化的彙總表，就查那張表。）樣本太少的種類，用對應 eval 腳本輸出的 token 數補。
- [ ] **Step 2: 查執行當天的價格與免費額度**，每一項附來源網址和查詢日期：Anthropic Haiku 5.5（input、output、cache read、cache write）、Cloud Run（`asia-southeast1` 免費額度）、Neon 免費方案（儲存空間、運算時數、連線數）、GCS（`asia-southeast1` Standard 儲存）、Firebase Hosting、LINE 官方帳號台灣免費方案的每月訊息則數與下一級方案價格、網域年費。
- [ ] **Step 3: 寫 `cost-estimate.md`**：每項服務一列，200 人／1,000 人兩欄，最後是每月總計和每人每月成本，並和規格 §7「每人每月約 US$0.2」比較。另外寫：
  - GCS 照片量：人數 × 3 × 90 天 × 150 KB（90 天後穩定）。
  - Neon 資料量：用 Task 3 量到的每人資料量推算一年後的大小，標出什麼時候會超過免費方案。
  - LINE push：人數 × 0.5 × 30 則，和免費方案的則數比較；超過時訓練完成通知會停掉（規格 §8.3 已接受），寫出改付費方案的門檻。
  - 對照預算警示 NT$1,000（`infra/budget.tf`）和 Anthropic 上限，說明夠不夠。
- [ ] **Step 4: 寫 `checklist.md`**，每項有「怎麼做」「怎麼確認」，用 `- [ ]` 列出：
  1. **服務信箱**：已建立，政策頁上的地址正確，寄一封測試信能收到。
  2. **法律審閱**：政策與條款送法律專業人士審閱；有修改就照「實質變更改版本」的規則處理。
  3. **網域**：Cloudflare Registrar 購買 → Firebase Hosting 加自訂網域（DNS 驗證）→ LINE Developers 把 LIFF endpoint URL 改成新網域 → 更新 api 的 `CORS_ORIGIN`（Terraform 變數）→ bot 的條款連結跟著 LIFF 網址走（確認同意卡片的連結打得開）→ 舊網址仍可用。
  4. **LINE 官方帳號**：名稱、頭像（核准的 logo）、狀態消息；Messaging API 的 webhook 已開啟並驗證成功；自動回應訊息與加入好友的歡迎訊息關閉（由 bot 處理）；聊天模式是 bot；Rich Menu 已設定為預設；**LINE Login channel 從「開發中」改成「已發布」**（否則一般使用者打不開 LIFF）；目前方案與本月訊息用量。
  5. **Anthropic**：主控台設定每月花費上限（`cost-estimate.md` 200 人估算 × 2，進位到 US$5 的倍數）；用量通知寄到服務信箱；正式金鑰只存在 Secret Manager。
  6. **GCP**：預算警示 NT$1,000（30%／100%／預測 100%）的收件人正確；10.2 的 Cloud Monitoring 警示有收到測試通知；Cloud Run `max_instance_count` 依 Task 3 結果確認。
  7. **資料權利**：用測試帳號實際走一次匯出、刪除、7 天排程（10.1）。
  8. **重新同意**：所有測試帳號都重新同意過；`consents` 有新版本的紀錄。
  9. **負載測試清理**：`api-loadtest` 服務和 Neon 測試分支已刪除。
  10. **上線當天**：在 `main` 合併最後的 PR、CI 部署成功、手機從加好友開始走一遍（同意 → 個人檔案 → 記訓練 → 拍餐點 → 問 AI → 今日總覽）。
- [ ] **Step 5: 自我檢查**：成本數字可以從文件裡的公式和來源重算出來；清單每項都有確認方式。
- [ ] **Step 6: Commit**：`git add docs/launch/cost-estimate.md docs/launch/checklist.md && git commit -m "docs: launch cost estimate and checklist"`

---

### Task 5: 收尾檢查與計畫備註

**Files:**

- Modify: `docs/superpowers/plans/2026-10-22-pr10-3-launch-readiness.md`（狀態、交接備註、下一個 PR 需要知道的事）、`docs/specs/2026-10-15-gym-assistant-coach-design.md`（§12 加一列：「政策改版：實質變更改 `CONSENT_VERSION`、所有人重新同意」；§7 成本估算後面加一句連到 `docs/launch/cost-estimate.md`）

- [ ] **Step 1: 全部檢查**：`npm test --workspaces --if-present`、`npm run typecheck --workspaces --if-present`、`npx eslint apps packages loadtest`、`npx prettier --check apps packages db .github docs loadtest`、`cd apps/bot && uv run pytest -q && uv run ruff check . && uv run ruff format --check .`，全部通過。
- [ ] **Step 2: 更新規格與本計畫的「狀態」「交接備註」「下一個 PR 需要知道的事」**，寫下實作時和計畫不同的地方，以及 Task 1 Step 2 查證 Anthropic 條款的來源與日期。
- [ ] **Step 3: Commit**：`git add docs && git commit -m "docs: PR 10.3 plan notes"`

---

## 部署

- **沒有 migration、Terraform 或新的環境變數。** api image 多了 `dist/loadtest-server.js`，但正式服務的啟動指令仍是 `node dist/server.js`。
- bot 和 LIFF 跟著 CI 正常部署（`CONSENT_VERSION` 改了，兩邊要一起上；同一次合併會一起部署）。
- 合併後：
  1. 用手機傳一則訊息給官方帳號，應該先看到同意卡片；打開兩個連結，確認是定稿內容、沒有「草稿」。
  2. 按同意後功能恢復正常；LIFF 也能正常打開（沒有卡在 `consent_required`）。
  3. 確認 `api-loadtest` 服務和 Neon 測試分支都已刪除。
  4. 照 `docs/launch/checklist.md` 一項項完成，全部打勾才公開上線。

## 狀態

- 2026-10-22：計畫完成，待使用者確認。實作要等 PR 10.1、10.2 合併。
- 2026-10-23：程式與文件部分完成（分支 `pr10-3-launch-readiness`，從 `origin/main` 建立並合併 `origin/pr10-2-rate-limit-monitoring`；尚未 push、尚未開 PR）。Task 1、2、4 完成；Task 3 只寫好腳本、fixture 與步驟，**還沒執行負載測試**；Task 5 的檢查全部通過：`npm test --workspaces`、`typecheck`、`eslint apps packages loadtest`、`prettier --check`、bot 的 `pytest`／`ruff check`／`ruff format --check`。本 PR 要在 PR 10.2（#26）之後合併。

## 交接備註

### 實作時和計畫不同的地方（2026-10-23）

- **Anthropic 條款查證（Task 1 Step 2，2026-10-23）**：
  - <https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training>：商業產品（含 API）的 input／output 預設不用於訓練；使用者回報意見或選擇加入時例外。
  - <https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data>：API 的 input／output 在收到或產生後 30 天內從後端自動刪除；例外是違反使用政策（最長 2 年、分類分數最長 7 年）、法律要求、雙方另有約定（例如 zero data retention）、Files API 等使用者自己保存的資料、意見回饋（5 年）。
  - 政策頁照這兩點寫，並加上「為了執行其使用政策或依法律要求，可能保存更久」。上線前法律審閱時請再確認一次。
- **政策頁**：`legal.test.ts` 比對前先把連續空白合成一個（prettier 會在「7」和「天」之間換行，瀏覽器顯示時是一個空白）。`import.meta.url` 在 LIFF 的 jsdom 測試環境不是 `file://`，改用 `import.meta.dirname`。兩頁在 375px 寬度用內建瀏覽器看過，沒有橫向捲動。政策頁另外寫了：同意紀錄、系統紀錄不含內容、IP 只在記憶體中計數（10.2 限流）、LINE 平台、個資法第 3 條權利「設定頁沒有的請來信」。
- **`consent-version.test.ts` 在改版本前就通過**（兩邊原本都是 `2026-10-19`），它是防止只改一邊的守門測試，不是 TDD 的紅燈。
- **限流 IP 上限（Task 2）**：10.2 的上限是寫死的常數，沒有環境變數。新增 `rateLimitOptions(secret, { ipMax })` 的選用參數和選用的 `AppDeps.rateLimitIpMax`（`buildApp` 傳進去），只有 `loadtest-server` 設定（讀 `RATE_LIMIT_IP_MAX`，預設 100,000，範圍 1–1,000,000）。正式的 `server.ts` 沒改，行為不變；`rate-limit.test.ts` 加了一個測試。
- `createFakeDeps` 多回傳 `schedulerServiceAccount`（`LOADTEST_SCHEDULER_SA`），假的服務帳號驗證永遠不會回這個身分，所以 `/jobs/*` 一律拒絕。`loadLoadtestConfig` 多回傳 `rateLimitIpMax`；`PORT` 預設 8080。`/internal/users/consent` 回 204（計畫寫的流程不變）。
- tsup 兩個 entry 會產生共用的 chunk 檔；Dockerfile 複製整個 `dist`，沒問題。已確認 `dist/server.js` 和它的 chunk 都不含假服務的程式碼，`K_SERVICE=api node dist/loadtest-server.js` 會結束並回 1。
- **k6 腳本（Task 3）和計畫不同的地方**：
  - 路由照實際程式：`POST /internal/users/today`（計畫寫 `GET`）、`PUT /body-metrics/today`（計畫寫 `POST /body-metrics`）、訓練記組是 `PUT /workouts/:id/sets`、`setIndex` 從 1 開始。
  - 內部路由要求 LINE ID 是 `U` + 32 個 hex，所以假使用者是 `U10ad<RUN 4 hex><編號 24 hex>`，`/auth/liff` 用 `loadtest:<LINE ID>`。`RUN` 每次執行不同，所以重跑時 AI 每日次數不會累積。
  - 每日上限情境用保留的第 0 個使用者；`/internal/*` 不受 api 限流，所以預期看到的是 `outcome: "limit"`（第 21–25 次），429 也接受。
  - 長度用 `STEADY_SECONDS`（k6 的 `--duration` 會蓋掉 scenarios，不能用）。門檻 tag 寫成 `{ai:true}`（k6 語法不加引號）。另加 `unexpected_outcomes` 門檻：steady 情境的 AI 回覆不是 `draft`／`answer`（例如撞到每日上限）就算失敗。
  - `meal.jpg` 是用 sharp 產生的 960×720 合成圖（約 94 KB），不是真的餐點照片；壓縮成本相近，假 AI 不看內容。
  - 根目錄 `eslint.config.js` 替 `loadtest/**/*.js` 加了 k6 全域變數（`__ENV`、`__VU`、`__ITER`、`open`）。
  - **腳本沒有用 k6 實際跑過**（實作環境沒有 k6，也不能動雲端）；`node --check` 與 eslint 通過。第一次執行建議先 `-e USERS=5 -e STEADY_SECONDS=30` 試跑。
  - `load-test.md` 的 image 用「目前 api 服務的 image」（`gcloud run services describe api`），所以要等本 PR 合併、CI 部署後才能跑。
- **成本估算（Task 4）**：正式 token 平均值還沒有，文件用標明「暫定」的假設值，並附上合併 `ai_usage_daily` 與 `ai_usage_anonymous_daily`（10.1）的查詢。價格查詢日 2026-10-23，Cloud Run（Tier 2 價格與免費額度）、GCS 新加坡價格、LINE 台灣方案、Cloud Monitoring 標「未確認」。估算發現三件事，已列進上線清單：
  - **Neon Free 的 100 CU-小時可能不夠**（200 人估計約 120 CU-小時），用完時資料庫會暫停到下個月。
  - **LINE 免費方案每月 200 則 push 只夠約 13 個活躍使用者的訓練完成通知**；中用量 2026-11-01 起 NT$1,000／月。
  - Cloud Run 主要成本是 api 和 bot 等 AI 回應的時間，200 人上限估計約 US$13／月。
- Anthropic 上限建議 US$40（200 人 AI 暫定 US$19.5 × 2）；`infra/README.md` 第 11 節原本寫 US$20，等實際 token 重算後再一起改。

### 原有備註

- 政策頁是 LIFF 的靜態檔（`apps/liff/public/`），不能 import TS；版本字串由 `legal.test.ts` 確認和 `CONSENT_VERSION` 一致。
- `CONSENT_VERSION` 有兩份：`packages/shared/src/auth.ts`（api、LIFF）和 `apps/bot/app/settings.py`（bot 的同意 postback）。`hasCurrentConsent` 只認完全相同的版本，所以改版本＝所有人重新同意。
- 負載測試**不能用 api 服務的 tagged revision**（原因見「規劃時的決定（實作細節）」第 1 點），一律用暫時的 `api-loadtest` 服務。
- `api-loadtest` 是公開 URL，安全性靠假驗證只接受隨機產生的 `LOADTEST_INTERNAL_TOKEN` 和 `loadtest:` token，而且連的是測試分支。測完一定要刪。
- 照片記餐的路由會跑 sharp 壓縮，這是 api 最吃 CPU 的地方；負載測試結果要特別看這個端點。

## 下一個 PR 需要知道的事

### 留給使用者的步驟（本 PR 沒做）

1. 合併前：確認 PR 10.2（#26）先合併；本分支已含 10.2 的 commit。
2. 合併後：照「部署」一節用手機確認同意卡片與兩頁定稿內容。
3. 照 `docs/launch/load-test.md` 跑負載測試（Neon 測試分支、`api-loadtest`、k6），把結果填進「結果」，然後刪掉服務和分支。
4. 在 Neon 正式分支跑 `docs/launch/cost-estimate.md` 的「待執行的查詢」，用結果和負載測試量到的資料量取代文件裡的暫定數字，重算 Anthropic 上限。
5. 政策與條款送法律審閱；有實質修改就改 `CONSENT_VERSION`（兩邊）和兩頁的版本。
6. 照 `docs/launch/checklist.md` 一項項完成（網域、LINE Login channel 發布、Anthropic 上限、警示測試、Neon 方案、LINE 方案等）。

### 實作前要確認的事（規劃時寫的）

本 PR 依賴 10.1、10.2，實作前先確認：

- **10.1**：刪除帳號與匯出的實際行為（政策頁照實際行為寫）；AI 用量的去識別化彙總表名稱（成本估算的查詢要用）；7 天刪除排程的名稱（上線清單要寫怎麼確認）。
- **10.2**：限流的環境變數名稱與預設值（`loadtest-server` 要讀、`api-loadtest` 要調高 IP 上限）；限流回應是不是 429；Cloud Monitoring 警示的通知管道（上線清單要寫怎麼測試）；Anthropic 用量上限是 app 內的全域上限還是只有主控台設定。

上線之後（第 2 期之前）：

- 用 `docs/launch/cost-estimate.md` 的公式，拿上線一個月後的真實用量重算一次，調整 AI 每日上限（規格 §12 #6）和預算警示。
- LINE push 用量接近免費方案上限時，評估付費方案（規格 §12 #5）。
