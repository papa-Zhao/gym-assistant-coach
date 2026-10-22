# PR 10.1: 資料權利（匯出、刪除、每日清理排程） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LIFF 設定頁可以「匯出我的資料」（JSON 檔）和「刪除我的所有資料」（立即停用、7 天內實際刪除），並用每日排程刪除到期帳號與過期的 AI 對話、課表。

**Architecture:**

- api：`DELETE /me` 把帳號標成 `deleted`，並把 `line_user_id` 改成 `deleted:{id}`，LINE 帳號立刻和舊資料脫鉤；所有 LIFF 路由的 session 驗證改成同時檢查帳號沒有被刪除。`GET /me/export` 回傳整理好的 JSON。新增 `POST /jobs/daily`（只接受排程服務帳號的 Google ID token），刪除到期帳號（含照片物件、AI 用量彙總成去識別化總數）並清理過期 AI 對話與課表；問 AI 不再每次順便清理。
- infra：新增 Cloud Scheduler 每日呼叫 `/jobs/daily`，用專用的服務帳號簽 OIDC token；api 多一個環境變數 `SCHEDULER_SA_EMAIL`。
- LIFF：設定頁的兩個「即將推出」按鈕改成真的功能；刪除前要再確認一次，完成後顯示結果並可關閉。

**Tech Stack:** 沿用現有套件，不新增。

**Spec:** [docs/specs/2026-10-15-gym-assistant-coach-design.md](../../specs/2026-10-15-gym-assistant-coach-design.md) §6.8（資料權利）、§8.1（照片物件）、§8.4（log 不含個資）、§10 PR 10。

**前一份計畫：** [2026-10-22-pr9-2-program-templates.md](2026-10-22-pr9-2-program-templates.md)。

## 已決定（2026-10-22，使用者同意）

1. PR 10 切成三個：10.1 資料權利（本計畫）、10.2 限流與監控、10.3 隱私權政策定稿＋負載與成本檢查＋上線清單。
2. **刪除不能取消。** 按下刪除後帳號立即停用，7 天內實際刪除。
3. **匯出只有文字資料**，不含照片。
4. 刪除後 LINE 帳號立刻和舊資料脫鉤；之後再傳訊息給 bot，就像全新使用者，重新走同意流程。
5. 封鎖官方帳號維持只標記、不刪除。

## 規劃時的決定（我替你做的）

1. **只做 JSON，不做 CSV。** 檔名 `gym-coach-export-YYYY-MM-DD.json`（台北日期）。
2. **下載方式：** LIFF 用 session 取得 JSON，轉成 Blob 用 `<a download>` 下載。LINE 內建瀏覽器若無法下載，合併後手機實測時會發現，再另開 PR 改成用外部瀏覽器開啟短效下載連結。
3. **刪除前再確認一次**：確認畫面寫明「無法復原」，按「確認刪除」才送出。完成後顯示「資料已刪除」和「關閉」按鈕（`liff.closeWindow()`）。
4. **7 天內刪除**：`DELETION_GRACE_DAYS = 6`，每日排程在台北時間 04:00 執行，最晚在第 7 天刪除。
5. **AI 用量去識別化**：刪除帳號前，把該使用者的 `ai_usage_daily` 加總進新表 `ai_usage_anonymous_daily`（依日期、種類），再刪除帳號。
6. **照片物件**：照片 key 是 `meals/{userId}/…`，刪除帳號時用前綴刪除該使用者的所有物件；GCS 刪除失敗時這個帳號留到隔天再試，不刪資料列。
7. **session 驗證多查一次帳號狀態**：舊的 session token 最多還有 1 小時效期，刪除後必須立刻失效，所以 LIFF 路由每個請求多一次主鍵查詢。
8. **排程用專用服務帳號** `scheduler-invoker`，audience 沿用 `gac-api-internal`；路由放在 `/jobs` 前綴，和 bot 用的 `/internal` 分開驗證。
9. **每次排程最多刪除 100 個帳號**，避免超過 Cloud Run 請求時間；剩下的隔天繼續。
10. **過期 AI 對話與課表的清理搬到排程**，`askCoach` 不再呼叫 `purgeExpiredMessages`。

## Global Constraints

- 使用者看得到的文字一律是繁體中文。
- log 不記錄使用者 ID、LINE ID、匯出內容或照片 key；排程只記錄刪除數量與錯誤類別名稱。
- 刪除寬限：`DELETION_GRACE_DAYS = 6`；每次排程上限 `PURGE_BATCH = 100`。
- 刪除後的 LINE ID 寫成 `deleted:{users.id}`；`status = 'deleted'`、`deleted_at = now`。
- 匯出不含：`line_user_id`、照片 key、照片、其他使用者的資料、內建動作與食物資料庫本身（只在紀錄中帶名稱）。
- LIFF 文字（原樣使用）：
  - 匯出按鈕：`匯出我的資料`
  - 刪除按鈕：`刪除我的所有資料`
  - 確認標題：`確定要刪除所有資料嗎？`
  - 確認說明：`你的個人檔案、身體數據、訓練、飲食、AI 對話都會刪除，無法復原。7 天內會完全清除。`
  - 確認按鈕：`確認刪除`；取消按鈕：`取消`
  - 完成：`資料已刪除`；說明：`之後再傳訊息給教練，會從頭開始。`
  - 失敗：`沒有成功，請稍後再試。`
- migration 0012（`npm run db:generate -w @gac/api` 產生後改檔名，`meta/_journal.json` 的 tag 一併改）。
- 不要 stage `.claude/` 和 `skills-lock.json`。本機 lint 用 `npx eslint apps packages` 和 `npx prettier --check apps packages db .github docs`。

## Review Focus

1. **刪除後舊 session 還在用**：刪除成功後，用同一個 token 呼叫任何 LIFF 路由（`/me`、`/profile`、`/meals/...`、`/workouts/...`）都回 401。（Task 1 測試）
2. **刪除後同一個 LINE 帳號再回來**：`syncUser` 用原本的 LINE ID 建立新帳號（新 `userId`、未同意），看不到舊資料；舊帳號仍是 `deleted`。（Task 1 測試）
3. **別人的資料混進匯出**：兩個使用者各有紀錄時，匯出只含自己的；使用者自訂的動作和食物只含自己的。（Task 2 測試）
4. **照片刪除失敗**：`deletePrefix` 拋錯時，那個帳號的資料列不刪、用量不加總（不會重複加總），其他帳號照常處理。（Task 3 測試）
5. **寬限期邊界**：`deleted_at` 剛好 6 天前的帳號會刪，5 天 23 小時前的不刪；`active`、`unfollowed` 帳號永遠不刪。（Task 3 測試）

---

### Task 1: 刪除帳號與 session 檢查

**Files:**

- Modify: `apps/api/src/users/repo.ts`、`apps/api/src/auth/session.ts`、`apps/api/src/auth/routes.ts`、`apps/api/src/workouts/http.ts`、`apps/api/src/metrics/routes.ts`、`apps/api/src/profile/routes.ts`（以及其他呼叫 `verifySession` 的地方）
- Test: `apps/api/test/users-repo.test.ts`、`apps/api/test/auth.test.ts`

**Interfaces:**

- Produces（`users/repo.ts`）：
  ```ts
  /** Marks the account deleted and frees its LINE id; idempotent. */
  export function requestAccountDeletion(db: Db, userId: string, now: Date): Promise<void>;
  ```
- Produces（`auth/session.ts`）：
  ```ts
  /** verifySession plus a check that the user exists and is not deleted; rejects otherwise. */
  export function verifyActiveSession(db: Db, secret: Uint8Array, token: string): Promise<{ userId: string }>;
  ```
- 路由：`DELETE /me`（session 驗證）→ 204。
- 所有原本 `bearerAuth((token) => verifySession(sessionSecret, token), …)` 的地方改用 `verifyActiveSession(db, sessionSecret, token)`。

- [ ] **Step 1: 寫失敗的測試**
  - `requestAccountDeletion` 後：`status = 'deleted'`、`deleted_at = now`、`line_user_id = 'deleted:' + id`；再呼叫一次不報錯、`deleted_at` 不變。
  - 刪除後 `syncUser(db, 原 LINE ID, name)` 回傳不同的 `userId`、`consented: false`；舊帳號仍是 `deleted`。
  - 刪除後 `markUnfollowed(db, 原 LINE ID)` 不會改到舊帳號。
  - `DELETE /me` 回 204；之後同一個 token 打 `/me` 回 401；再打 `GET /profile`、一個 workouts 路由、一個 meals 路由都回 401。
  - 沒有 token 打 `DELETE /me` 回 401。
- [ ] **Step 2: 跑測試確認失敗**：`npm test -w @gac/api -- users-repo auth`，預期 FAIL。
- [ ] **Step 3: 實作 `requestAccountDeletion`、`verifyActiveSession`、`DELETE /me`，並替換所有 session 驗證。** `requestAccountDeletion` 只更新 `status <> 'deleted'` 的列。
- [ ] **Step 4: 跑測試確認通過**：`npm test -w @gac/api`（全部，因為所有 LIFF 路由的驗證都改了）、`npm run typecheck -w @gac/api`。
- [ ] **Step 5: Commit**：`git add apps/api/src apps/api/test && git commit -m "feat(api): account deletion request and active-session check"`

---

### Task 2: 匯出資料

**Files:**

- Create: `packages/shared/src/export.ts`（並從 `packages/shared/src/index.ts` 匯出）、`apps/api/src/users/export.ts`、`apps/api/test/export.test.ts`
- Modify: `apps/api/src/auth/routes.ts`（加路由）

**Interfaces:**

- shared：
  ```ts
  export interface DataExport {
    exportedAt: string; // ISO 時間
    account: { displayName: string | null; createdAt: string };
    consents: { doc: string; version: string; agreedAt: string }[];
    profile: Record<string, unknown> | null;
    bodyMetrics: Record<string, unknown>[];
    workoutSessions: Record<string, unknown>[]; // 含 items（動作名稱）、sets、cardio
    workoutTemplates: Record<string, unknown>[]; // 含 items（動作名稱）
    customExercises: Record<string, unknown>[];
    meals: Record<string, unknown>[]; // 含 items（食物名稱），不含照片
    customFoods: Record<string, unknown>[];
    aiConversations: Record<string, unknown>[]; // 含 messages
    aiPrograms: Record<string, unknown>[];
    aiUsage: { day: string; kind: string; count: number }[];
  }
  ```
- `users/export.ts`：`export function exportUserData(db: Db, userId: string, now: Date): Promise<DataExport>;`
- 路由：`GET /me/export`（session 驗證，用 Task 1 的 `verifyActiveSession`）→ 200 `DataExport`。

- [ ] **Step 1: 寫失敗的測試**（用 `createTestDb`）
  - 使用者 A、B 各有：身體數據、一次訓練（含一組）、一個範本、一個自訂動作、一餐（含品項與一張照片紀錄）、一個自訂食物、一段 AI 對話、一份課表、一筆 AI 用量。A 的匯出：每個區塊都只有 A 的資料，數量正確；訓練和範本的動作有中文名稱；餐點品項有食物名稱。
  - 匯出的 JSON 字串不含 A 的 LINE ID、不含照片 key（`meals/`）、不含 B 的任何 id。
  - 什麼都沒有的新使用者：`profile` 是 null、其他陣列都是空的。
  - `GET /me/export` 回 200 和 `DataExport`；刪除後同一個 token 回 401。
- [ ] **Step 2: 跑測試確認失敗**：`npm test -w @gac/api -- export`，預期 FAIL。
- [ ] **Step 3: 實作 `DataExport`、`exportUserData`、路由。** 每個區塊一個查詢（加必要的 join），依建立時間排序；時間一律輸出 ISO 字串。
- [ ] **Step 4: 跑測試確認通過**：`npm test -w @gac/api -- export auth`、`npm test -w @gac/shared`、`npm run typecheck -w @gac/api`、`npm run typecheck -w @gac/liff`。
- [ ] **Step 5: Commit**：`git add packages/shared/src apps/api/src apps/api/test && git commit -m "feat(api): export a user's data as JSON"`

---

### Task 3: 每日清理排程（api）

**Files:**

- Modify: `apps/api/src/db/schema.ts`、`apps/api/src/photos/store.ts`、`apps/api/src/config.ts`、`apps/api/src/deps.ts`、`apps/api/src/server.ts`、`apps/api/src/app.ts`、`apps/api/src/ask/service.ts`（拿掉 `purgeExpiredMessages`）、`apps/api/test/ask-service.test.ts`（拿掉或改寫預期每次提問會清理的測試）、`apps/api/test/config.test.ts`
- Create: `db/migrations/0012_ai_usage_anonymous.sql`、`apps/api/src/jobs/purge.ts`、`apps/api/src/jobs/routes.ts`、`apps/api/test/jobs.test.ts`

**Interfaces:**

- 資料表 `ai_usage_anonymous_daily`：`day date`、`kind text`（同 `AI_KINDS` check）、`count`、`input_tokens`、`output_tokens`、`cache_read_tokens`、`cache_creation_tokens`（都是 `integer not null default 0`）；主鍵 `(day, kind)`。
- `photos/store.ts`：`PhotoStore` 加 `deletePrefix(prefix: string): Promise<void>`（GCS 用 `bucket.deleteFiles({ prefix })`，套用 `withPhotoDeadline`）；測試用的記憶體版本一併實作。另外匯出 `mealPhotoPrefix(userId: string): string`（回傳 `meals/{userId}/`），`newMealPhotoKey` 改用它。
- `jobs/purge.ts`：
  ```ts
  export const DELETION_GRACE_DAYS = 6;
  export const PURGE_BATCH = 100;
  /** Hard-deletes accounts deleted at least DELETION_GRACE_DAYS ago (oldest first, at most PURGE_BATCH); returns how many were removed. */
  export function purgeDeletedUsers(db: Db, photoStore: PhotoStore, now: Date): Promise<number>;
  ```
  每個帳號：先 `deletePrefix(mealPhotoPrefix(id))`；失敗就跳過這個帳號（記錯誤類別名稱）。成功後在一個 transaction 內把 `ai_usage_daily` 加總 upsert 進 `ai_usage_anonymous_daily`，再刪除 `users` 列（其餘資料由 cascade 刪除）。
- config：新增必填 `SCHEDULER_SA_EMAIL` → `Config.schedulerServiceAccount`、`AppDeps.schedulerServiceAccount`。
- `jobs/routes.ts`：在 `/jobs` 前綴註冊；`onRequest` 用 `bearerAuth` + `verifyServiceToken`，email 必須等於 `schedulerServiceAccount`（bot 的帳號回 401）。
  ```
  POST /jobs/daily  （無 body）
  200: { deletedUsers: number }
  ```
  依序執行 `purgeDeletedUsers`、`purgeExpiredMessages`；log 一行 `{ event: "daily_job", deletedUsers, ms }`。
- `purgeExpiredMessages` 的 doc comment 改成「由每日排程呼叫」。

- [ ] **Step 1: 寫失敗的測試**
  - `purgeDeletedUsers`：
    - `deleted_at` 剛好 6 天前的帳號被刪除；5 天 23 小時前的保留；`active`、`unfollowed` 的保留。
    - 被刪的帳號：`users` 列不見、其訓練／飲食／AI 對話等都不見；記憶體照片庫中 `meals/{id}/` 開頭的物件都被刪除，其他使用者的物件保留。
    - `ai_usage_anonymous_daily` 得到該帳號用量的加總；已有同一天同種類的列時是相加。
    - `deletePrefix` 對某個帳號拋錯：該帳號的列和用量都還在、匿名表沒有加總；同一批另一個帳號照常刪除；回傳值只算成功的。
    - 超過 100 個到期帳號時只刪 100 個，從最早刪除的開始。
  - `POST /jobs/daily`：排程帳號的 token 回 200 `{ deletedUsers: N }`，且 91 天前的 AI 訊息被清掉；bot 帳號的 token 回 401；沒有 token 回 401。
  - config：缺 `SCHEDULER_SA_EMAIL` 時拋錯，訊息只含變數名稱。
  - `askCoach` 不再刪除過期訊息（改寫原本的測試：提問後 91 天前的訊息仍在）。
- [ ] **Step 2: 跑測試確認失敗**：`npm test -w @gac/api -- jobs config ask-service`，預期 FAIL。
- [ ] **Step 3: 改 schema、產生 0012、實作 `deletePrefix`、`purge.ts`、`jobs/routes.ts`、config／deps／server／app 接線，`askCoach` 拿掉清理。**
- [ ] **Step 4: 跑測試確認通過**：`npm test -w @gac/api`（全部）、`npm run typecheck -w @gac/api`。
- [ ] **Step 5: Commit**：`git add apps/api/src apps/api/test db/migrations && git commit -m "feat(api): daily job purges deleted accounts and expired AI data"`

---

### Task 4: Cloud Scheduler（Terraform）

**Files:**

- Create: `infra/scheduler.tf`、`infra/tests/scheduler.tftest.hcl`
- Modify: `infra/apis.tf`（加 `cloudscheduler`）、`infra/run.tf`（api 的 `service_env` 加 `SCHEDULER_SA_EMAIL`）、`infra/README.md`（說明排程與手動觸發方式）

**Interfaces:**

- `google_service_account.scheduler_invoker`（account_id `scheduler-invoker`）。
- `google_cloud_scheduler_job.daily`：`schedule = "0 4 * * *"`、`time_zone = "Asia/Taipei"`、`region = var.region`、`attempt_deadline = "300s"`、`retry_config { retry_count = 1 }`；`http_target`：`POST ${local.api_url}/jobs/daily`，`oidc_token { service_account_email = scheduler_invoker.email, audience = local.internal_aud }`。
- `depends_on` 包含 `google_project_service.enabled`。

- [ ] **Step 1: 寫 `scheduler.tftest.hcl`（先失敗）**：`command = plan`，比照 `core.tftest.hcl` 的 mock provider 與 override；斷言 job 的 schedule、time_zone、URI 結尾是 `/jobs/daily`、OIDC audience 是 `gac-api-internal`、api 的環境變數含 `SCHEDULER_SA_EMAIL`。
- [ ] **Step 2: 跑測試確認失敗**：`cd infra && terraform init -backend=false && terraform test`，預期 FAIL。
- [ ] **Step 3: 實作 `scheduler.tf`、`apis.tf`、`run.tf`、README。**
- [ ] **Step 4: 跑測試確認通過**：`cd infra && terraform fmt -check && terraform validate && terraform test`。
- [ ] **Step 5: Commit**：`git add infra && git commit -m "feat(infra): daily Cloud Scheduler job for the api"`

---

### Task 5: LIFF 設定頁的匯出與刪除

**Files:**

- Modify: `apps/liff/src/pages/Settings.tsx`、`apps/liff/src/pages/Settings.test.tsx`、`apps/liff/src/App.tsx`（把 `onClose` 傳給 `Settings`）
- Create: `apps/liff/src/dataRights.ts`、`apps/liff/src/dataRights.test.ts`

**Interfaces:**

- `dataRights.ts`：
  ```ts
  /** Fetches GET /me/export and returns the file name and JSON text to save. */
  export function fetchExport(today: string): Promise<{ fileName: string; json: string }>;
  /** Calls DELETE /me. */
  export function deleteAccount(): Promise<void>;
  /** Saves text as a download via a Blob URL and a temporary <a download>. */
  export function saveFile(fileName: string, text: string): void;
  ```
  `fileName` 是 `gym-coach-export-${today}.json`；`json` 用 2 個空白縮排。
- `Settings` props：`{ today: string; onClose: () => void }`。「即將推出」只剩「訓練範本」。

- [ ] **Step 1: 寫失敗的測試**
  - `dataRights.test.ts`：`fetchExport` 呼叫 `/me/export` 並回傳正確檔名；`deleteAccount` 送 `DELETE /me`。
  - `Settings.test.tsx`：
    - 「匯出我的資料」可以按；按下後呼叫 `fetchExport` 與 `saveFile`；失敗時顯示 `沒有成功，請稍後再試。`。
    - 「刪除我的所有資料」按下後先出現確認畫面（標題與說明文字和 Global Constraints 一致），按「取消」回到設定頁且沒有呼叫 `deleteAccount`。
    - 按「確認刪除」呼叫 `deleteAccount` 一次；成功後顯示 `資料已刪除` 與說明，按「關閉」呼叫 `onClose`；失敗時顯示 `沒有成功，請稍後再試。` 並可再試。
    - 送出中按鈕停用（避免連按）。
    - 「訓練範本」仍顯示「即將推出」；條款與隱私權連結不變。
- [ ] **Step 2: 跑測試確認失敗**：`npm test -w @gac/liff -- Settings dataRights`，預期 FAIL。
- [ ] **Step 3: 實作。** 樣式沿用現有 `card`、`row` class 與設計 token。
- [ ] **Step 4: 跑測試確認通過**：`npm test -w @gac/liff`、`npm run typecheck -w @gac/liff`、`npm run build -w @gac/liff`。
- [ ] **Step 5: Commit**：`git add apps/liff/src && git commit -m "feat(liff): export and delete my data in settings"`

---

### Task 6: 收尾檢查與計畫備註

**Files:**

- Modify: `docs/superpowers/plans/2026-10-22-pr10-1-data-rights.md`（狀態、交接備註、下一個 PR 需要知道的事）

- [ ] **Step 1: 全部檢查**：`npm test --workspaces --if-present`、`npm run typecheck --workspaces --if-present`、`npx eslint apps packages`、`npx prettier --check apps packages db .github docs`、`cd apps/bot && uv run pytest -q && uv run ruff check . && uv run ruff format --check .`、`cd infra && terraform fmt -check && terraform test`，全部通過。
- [ ] **Step 2: 更新本計畫的「狀態」「交接備註」「下一個 PR 需要知道的事」**，寫下實作時和計畫不同的地方。
- [ ] **Step 3: Commit**：`git add docs/superpowers/plans/2026-10-22-pr10-1-data-rights.md && git commit -m "docs: PR 10.1 plan notes"`

---

## 部署

**順序很重要：api 新版本啟動時需要 `SCHEDULER_SA_EMAIL`，所以要先套用 Terraform 再合併。**

1. **【使用者自行操作】** 在 PR 分支上：`cd infra && terraform apply`。會啟用 Cloud Scheduler API、建立 `scheduler-invoker` 服務帳號與每日排程，並在 api 加上 `SCHEDULER_SA_EMAIL`。舊版 api 會忽略這個變數。
2. 合併 PR；部署流程會先備份 DB 再套用 migration 0012（只新增 `ai_usage_anonymous_daily`）。
3. 手動觸發一次排程確認可以執行：`gcloud scheduler jobs run daily --location=asia-southeast1`，到 Cloud Logging 找 `daily_job`。
4. 手機實測：
   1. 設定頁「匯出我的資料」，確認 iOS、Android 的 LINE 內建瀏覽器都能下載 JSON。不能下載就記在交接備註，另開 PR 改成外部瀏覽器下載。
   2. 用測試帳號「刪除我的所有資料」，確認出現「資料已刪除」；回到聊天室傳訊息，確認重新出現同意流程；LIFF 首頁看不到舊資料。

## 狀態

- 2026-10-22：計畫完成，待使用者確認。

## 交接備註

（實作完成後填寫）

## 下一個 PR 需要知道的事

PR 10.2（限流與監控）、10.3（上線前收尾）會用到：

- 每日排程 `POST /jobs/daily` 已存在；10.2 可以替它加失敗警示（Cloud Scheduler 執行失敗或 `daily_job` 沒出現）。
- 刪除帳號再重新加入會得到新的 `userId`，AI 每日次數也會重新計算；10.2 的限流若要防這種情況，要依 LINE ID 或 IP 計數。
- 10.3 隱私權政策要寫：匯出只有 JSON 文字資料、刪除不能取消、7 天內完全清除（含照片）、AI 用量只保留不含身分的每日總數、封鎖官方帳號只標記不刪除、AI 對話與課表保存 90 天、照片 90 天。
