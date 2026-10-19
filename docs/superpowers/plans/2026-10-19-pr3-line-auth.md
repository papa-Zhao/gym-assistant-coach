# PR 3: LINE Channel, Consent and LIFF Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加好友 → 同意條款 → 開啟 LIFF 能顯示自己的名字（spec §10 PR 3 完成條件）。

**Architecture:** `bot` 驗證 LINE webhook 簽章、處理 follow / postback / message / unfollow 事件，並以 Google ID token 呼叫 `api` 的 `/internal/*`。`api` 是唯一碰資料庫的服務，負責 `users`、`consents` 與 LIFF 登入（驗證 LINE ID token 後發 1 小時的 access token）。LIFF 用 `@line/liff` 登入，呼叫 `api` 顯示名字，畫面套用已核准的設計 token。

**Tech Stack:**

- api：Fastify 5、drizzle-orm + postgres.js（測試用 `@electric-sql/pglite`）、`jose`（session JWT）、`google-auth-library`（驗證 bot 的 ID token）、`@fastify/cors`
- bot：FastAPI、`line-bot-sdk` v3、`google-auth`、`httpx`
- liff：React 19、`@line/liff`
- infra：Terraform（新增 `hashicorp/random`）

**Spec:** [docs/specs/2026-10-15-gym-assistant-coach-design.md](../../specs/2026-10-15-gym-assistant-coach-design.md) §3.1–3.3、§4、§5（`users`、`consents`）、§8.1–8.2、§10 PR 3、§10.1 核准紀錄。

## Global Constraints

- `bot` 不直接連資料庫、不呼叫 AI；`api` 是唯一的資料庫存取者（§3.1）。
- `bot` → `api`：Google ID token，`api` 驗簽章、audience、服務帳號 email，**不用共用密碼**（§3.2）。
- `bot` 必須在 webhook 請求內完成處理並回覆，回覆後才回 200（§3.3）。
- LINE webhook 驗簽，失敗一律拒絕（§8.1）。
- 主鍵一律 `uuid`，時間一律 `timestamptz`（§5）。
- 使用者以 LINE userId 識別。同意紀錄寫入 `consents`（文件、版本、時間）；MVP 限 18 歲以上（§4、§12 #1）。
- LIFF 的 access token 約 1 小時、只存在記憶體（§4）。
- 機密只放 Secret Manager，不寫進程式、log 或 commit（§8.1）。
- 所有使用者看得到的文字用繁體中文（台灣用語）。LIFF 畫面依 §10.1 核准設計稿與 `packages/shared` 的 token；按鈕高度 ≥ 44px。
- 同意文件版本：`CONSENT_VERSION = "2026-10-19"`，三份文件 `terms`、`privacy`、`age_18_plus` 一起同意。
- 內部 audience 字串：`gac-api-internal`。
- 以下由**使用者親自操作**，agent 不經手其值：建立 LINE 帳號與 channel、貼 channel secret 與 access token 到 Secret Manager。

## Review Focus

1. **非 ASCII 內容的 webhook**（例如中文訊息）：簽章必須用原始 request bytes 驗證，不能用重新序列化的 JSON。由 Task 5 測試涵蓋。
2. **LINE 重送或重複 follow**：`syncUser` 必須冪等，同一個 LINE userId 永遠對到同一筆 `users`。由 Task 1 測試涵蓋。
3. **封鎖後重新加好友**：狀態要回到 `active`，已同意的紀錄保留，不必重新同意。由 Task 1 測試涵蓋。
4. **過期或偽造的 access token 打 `/me`**：回 401，LIFF 要重新登入。由 Task 3、Task 6 測試涵蓋。
5. **沒加好友或沒同意就開 LIFF**：`/auth/liff` 回 403 `consent_required`，LIFF 顯示「請先在聊天室同意條款」。由 Task 3、Task 6 測試涵蓋。

---

## File Structure

| 路徑 | 職責 |
|---|---|
| `packages/shared/src/auth.ts` | 同意版本常數與 api/liff/bot 共用的回應型別 |
| `apps/api/src/db/schema.ts` | `users`、`consents` 的 Drizzle schema |
| `db/migrations/0001_*.sql` | 由 drizzle-kit 產生的 migration |
| `apps/api/src/users/repo.ts` | `syncUser`、`recordConsent`、`markUnfollowed`、`findByLineUserId`、`hasCurrentConsent` |
| `apps/api/src/internal/routes.ts` | `/internal/users/*`，以及 bot ID token 驗證的 preHandler |
| `apps/api/src/auth/routes.ts` | `POST /auth/liff`、`GET /me` |
| `apps/api/src/auth/session.ts` | 簽發與驗證 session JWT |
| `apps/api/src/auth/line.ts` | 用 LINE verify endpoint 驗證 ID token |
| `apps/api/src/config.ts` | 從環境變數讀設定 |
| `apps/api/src/app.ts`、`server.ts`（修改） | 注入依賴並組裝 app |
| `apps/bot/app/settings.py`、`api_client.py`、`messages.py`、`handlers.py`、`main.py` | webhook、事件處理、訊息文案、呼叫 api |
| `apps/liff/src/auth.ts`、`App.tsx`、`theme.css`（產生） | LIFF 登入流程與首頁 |
| `apps/liff/public/terms.html`、`privacy.html` | 條款與隱私權政策草稿 |
| `infra/secrets.tf`、`infra/run.tf`、`infra/variables.tf`（修改） | 新 secret、環境變數、session secret |
| `docs/line-setup.md` | 使用者建立 LINE 帳號與 channel 的步驟 |

---

### Task 1: 資料表與 users 存取層

**Files:**

- Create: `packages/shared/src/auth.ts`，並在 `packages/shared/src/index.ts` re-export
- Modify: `apps/api/src/db/schema.ts`
- Create: `db/migrations/0001_users_consents.sql`（由 drizzle-kit 產生）
- Create: `apps/api/src/users/repo.ts`
- Create: `apps/api/test/db.ts`（pglite 測試輔助）
- Test: `apps/api/test/users-repo.test.ts`

**Interfaces:**

- Produces（shared）：
  - `CONSENT_VERSION = "2026-10-19"`
  - `CONSENT_DOCS = ["terms", "privacy", "age_18_plus"] as const`
  - `type ConsentDoc`
  - `interface SyncUserResponse { userId: string; consented: boolean }`
  - `interface LiffAuthResponse { accessToken: string; expiresIn: number; displayName: string }`
  - `interface MeResponse { displayName: string }`
  - `interface ApiError { error: "consent_required" | "unauthorized" | "bad_request" }`
- Produces（api）：
  - `type Db = PgDatabase<...>`：`createTestDb()` 和正式環境的 postgres.js 版本都要符合這個型別
  - `syncUser(db, lineUserId: string, displayName: string | null): Promise<SyncUserResponse>`：沒有就建立；狀態設為 `active`；`displayName` 不為 null 時更新
  - `recordConsent(db, lineUserId: string, version: string): Promise<void>`：寫入三份文件，`(user_id, doc, version)` 重複時不報錯
  - `markUnfollowed(db, lineUserId: string): Promise<void>`
  - `findByLineUserId(db, lineUserId): Promise<{ id: string; displayName: string | null; status: string } | null>`
  - `hasCurrentConsent(db, userId: string): Promise<boolean>`：三份文件都有 `CONSENT_VERSION` 才回 true
- Produces（test）：`createTestDb(): Promise<Db>`，用 pglite 並套用 `db/migrations`

- [ ] **Step 1: 寫 schema。**
  - `users`：
    - `id uuid pk default gen_random_uuid()`
    - `line_user_id text not null unique`
    - `display_name text`
    - `role text not null default 'user'`，check 值為 `user`／`coach`／`admin`
    - `status text not null default 'active'`，check 值為 `active`／`unfollowed`／`deleted`
    - `created_at timestamptz not null default now()`
    - `deleted_at timestamptz`
  - `consents`：
    - `id uuid pk`
    - `user_id uuid not null`，references `users.id` on delete cascade
    - `doc text not null`，check 值在 `CONSENT_DOCS` 中
    - `version text not null`
    - `agreed_at timestamptz not null default now()`
    - unique `(user_id, doc, version)`
- [ ] **Step 2: 產生 migration。** 執行 `npm run db:generate -w @gac/api -- --name=users_consents`。Expected：產生 `db/migrations/0001_users_consents.sql`，裡面有兩張表。
- [ ] **Step 3: 寫失敗的測試** `users-repo.test.ts`（每個測試都用新的 `createTestDb()`）：
  - `syncUser creates a user once`：同一個 `U1` 呼叫兩次，`userId` 相同，`consented` 為 false
  - `syncUser updates display name but keeps it when null`
  - `recordConsent makes hasCurrentConsent true and is idempotent`：呼叫兩次不報錯
  - `older consent version does not count`：用 `"2020-01-01"` 同意後，`hasCurrentConsent` 仍為 false
  - `refollow after unfollow restores active and keeps consent`：`markUnfollowed` 後 `status` 為 `unfollowed`；再 `syncUser` 後 `status` 為 `active`，`consented` 為 true
- [ ] **Step 4: 執行測試** `npm test -w @gac/api`。Expected：FAIL，因為 repo 還不存在。
- [ ] **Step 5: 實作** `repo.ts`、`test/db.ts`（`drizzle-orm/pglite` 加上 `migrate(db, { migrationsFolder: "../../db/migrations" })`）與 `shared/auth.ts`。`syncUser` 用 `insert ... onConflictDoUpdate`。
- [ ] **Step 6: 執行測試** `npm test -w @gac/api && npm run typecheck`。Expected：PASS。
- [ ] **Step 7: Commit** `feat(api): add users and consents tables`

### Task 2: 內部端點與 bot 身分驗證

**Files:**

- Create: `apps/api/src/internal/routes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/internal.test.ts`

**Interfaces:**

- Consumes: Task 1 repo, `Db`
- Produces:
  - `type VerifyServiceToken = (token: string) => Promise<{ email: string }>`：簽章、audience、`email_verified` 不符時 reject
  - `buildApp(deps: AppDeps, options?)`，其中 `interface AppDeps { db: Db; verifyServiceToken: VerifyServiceToken; botServiceAccount: string; verifyLineIdToken: VerifyLineIdToken; sessionSecret: Uint8Array; corsOrigin: string }`（Task 3 定義的欄位在這裡先列出；這個 task 的測試只用到前三個）
  - 路由，全部需要 `Authorization: Bearer <Google ID token>`：
    - `POST /internal/users/sync`：body `{ lineUserId, displayName? }`，回 `SyncUserResponse`
    - `POST /internal/users/consent`：body `{ lineUserId, version }`，回 204
    - `POST /internal/users/unfollow`：body `{ lineUserId }`，回 204
  - `lineUserId` 必須符合 `^U[0-9a-f]{32}$`，否則回 400 `bad_request`

- [ ] **Step 1: 寫失敗的測試**（用 `app.inject`，`verifyServiceToken` 用假的：token `good` 回傳 `bot-runtime@x.iam.gserviceaccount.com`，token `other` 回傳別的 email，其他 token 一律 reject）：
  - `rejects missing token with 401`
  - `rejects a valid token from another service account with 401`
  - `sync returns consented false then true after consent`
  - `rejects malformed lineUserId with 400`
  - `unfollow returns 204 and marks user`
  - `GET /health still works without auth`
- [ ] **Step 2: 執行** `npm test -w @gac/api`。Expected：FAIL。
- [ ] **Step 3: 實作。** 驗證寫成只套用在 `/internal` prefix 的 Fastify `preHandler`；body 用 Fastify JSON schema 驗證。`buildApp` 改為接收 `deps`，並更新 `health.test.ts` 傳入測試用的 deps。
- [ ] **Step 4: 執行** `npm test -w @gac/api && npm run typecheck`。Expected：PASS。
- [ ] **Step 5: Commit** `feat(api): add internal user endpoints with service token auth`

### Task 3: LIFF 登入與 /me

**Files:**

- Create: `apps/api/src/auth/session.ts`、`apps/api/src/auth/line.ts`、`apps/api/src/auth/routes.ts`
- Modify: `apps/api/src/app.ts`（註冊路由與 `@fastify/cors`）
- Test: `apps/api/test/auth.test.ts`、`apps/api/test/line-verify.test.ts`

**Interfaces:**

- Consumes: Task 1 repo、Task 2 的 `AppDeps`
- Produces:
  - `type VerifyLineIdToken = (idToken: string) => Promise<{ sub: string; name: string | null }>`
  - `createLineVerifier(channelId: string, fetchImpl = fetch): VerifyLineIdToken`：以表單 `id_token`、`client_id` 呼叫 `POST https://api.line.me/oauth2/v2.1/verify`；非 200 回應時 reject
  - `issueSession(secret: Uint8Array, userId: string, now?: Date): Promise<string>`：HS256，`sub` 為 userId，`exp` 為 3600 秒後
  - `verifySession(secret, token): Promise<{ userId: string }>`：過期或簽章錯誤時 reject
  - `POST /auth/liff`：body `{ idToken }`
    - 成功：回 200 `LiffAuthResponse`（`expiresIn: 3600`）；LINE 的 `name` 不為 null 時，同時更新 `display_name`
    - 驗證失敗：回 401 `unauthorized`
    - 使用者不存在或沒同意：回 403 `consent_required`
  - `GET /me`：需要 `Authorization: Bearer <session>`，回 `MeResponse`；token 無效時回 401
  - CORS 只允許 `deps.corsOrigin`

- [ ] **Step 1: 寫失敗的測試**：
  - `auth.test.ts`：
    - `consented user gets a token and /me returns name`
    - `unknown user gets 403 consent_required`
    - `user without consent gets 403 consent_required`
    - `invalid LINE token gets 401`
    - `/me rejects expired token with 401`：用 `issueSession` 搭配 2 小時前的 `now`
    - `/me rejects token signed with another secret with 401`
    - `CORS allows configured origin only`：preflight 請求帶 `Origin: https://evil.example` 時，不回傳 allow-origin
  - `line-verify.test.ts`，用假的 fetch：
    - `posts id_token and client_id as form`
    - `rejects on 400`
- [ ] **Step 2: 執行測試**。Expected：FAIL。
- [ ] **Step 3: 實作**，用 `jose` 的 `SignJWT` 與 `jwtVerify`。
- [ ] **Step 4: 執行** `npm test -w @gac/api && npm run typecheck && npm run lint`。Expected：PASS。
- [ ] **Step 5: Commit** `feat(api): add LIFF login and /me`

### Task 4: api 正式環境設定

**Files:**

- Create: `apps/api/src/config.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/test/config.test.ts`

**Interfaces:**

- Produces: `loadConfig(env: NodeJS.ProcessEnv): Config`
  - 必要的環境變數：`DATABASE_URL`、`SESSION_SECRET`（至少 32 bytes）、`LINE_LOGIN_CHANNEL_ID`、`BOT_SA_EMAIL`、`INTERNAL_AUDIENCE`、`CORS_ORIGIN`
  - 缺少時丟出 `Error`，訊息要列出缺少的**變數名稱**，但不能包含任何值
  - `PORT` 預設 8080
- `server.ts` 組裝正式依賴：
  - `postgres(DATABASE_URL, { max: 5 })` 加上 drizzle
  - `verifyServiceToken`：用 `google-auth-library` 的 `OAuth2Client().verifyIdToken({ idToken, audience: INTERNAL_AUDIENCE })`
  - `createLineVerifier(LINE_LOGIN_CHANNEL_ID)`

- [ ] **Step 1: 寫失敗的測試**：
  - `lists missing variable names without values`
  - `rejects short SESSION_SECRET`
  - `parses a full env`
- [ ] **Step 2: 執行測試**。Expected：FAIL。
- [ ] **Step 3: 實作** `loadConfig`，並改寫 `server.ts`。
- [ ] **Step 4: 執行** `npm test -w @gac/api && npm run build -w @gac/api`。Expected：PASS，且打包成功。
- [ ] **Step 5: Commit** `feat(api): load production config and wire real dependencies`

### Task 5: bot webhook 與首次使用流程

**Files:**

- Create: `apps/bot/app/settings.py`、`api_client.py`、`messages.py`、`handlers.py`
- Modify: `apps/bot/app/main.py`、`apps/bot/pyproject.toml`（加入 `line-bot-sdk>=3.26`、`google-auth>=2.62`、`httpx>=0.28`；正式依賴，不放 dev）
- Test: `apps/bot/tests/test_webhook.py`

**Interfaces:**

- Consumes: Task 2 的三個內部端點、shared 的 `CONSENT_VERSION`（Python 端用常數 `CONSENT_VERSION = "2026-10-19"` 複製一份）
- Produces:
  - `create_app(settings: Settings, api: ApiClient, line: LineReplier) -> FastAPI`
  - `main.py` 的 `app` 由 `create_app` 用正式依賴建立。`/health` 不需要任何設定，設定在第一次 webhook 時才延遲載入。
  - `class ApiClient(Protocol)`：`sync(line_user_id, display_name) -> SyncResult`、`consent(line_user_id, version) -> None`、`unfollow(line_user_id) -> None`
  - 正式版本用 `google.oauth2.id_token.fetch_id_token(Request(), INTERNAL_AUDIENCE)` 加上 `httpx`，timeout 5 秒
  - `class LineReplier(Protocol)`：`reply(reply_token, messages)`、`profile_name(user_id) -> str | None`、`show_loading(user_id)`
  - `Settings` 從環境變數讀：`LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`API_URL`、`INTERNAL_AUDIENCE`、`LIFF_ID`、`PUBLIC_SITE_URL`
  - `POST /webhook`：用原始 body 與 `X-Line-Signature` 做 `WebhookParser.parse`；簽章錯誤回 400；處理完全部事件後回 200
- 事件處理規則：
  - `follow`：`sync`，接著：
    - 未同意 → 回覆**歡迎訊息**
    - 已同意 → 回覆**歡迎回來**
  - `postback`，data 為 `action=consent&version=2026-10-19`：`consent`，再回覆**同意完成**
  - `message`：`sync`，接著：
    - 未同意 → 再回覆**歡迎訊息**
    - 已同意 → 回覆文字「收到！記錄功能下個版本就會開放。」（PR 4 起替換）
  - `unfollow`：`unfollow`，不回覆
- 文案（`messages.py`，Flex 只用 token 的顏色與圓角）：
  - **歡迎訊息**：
    - Flex bubble，標題「歡迎使用 Gym Assistant Coach」
    - 內文「我可以幫你記錄訓練、拍照記飲食，也能依你的資料給建議。開始前請先閱讀並同意以下文件。」
    - 兩個連結：「服務條款」→ `{PUBLIC_SITE_URL}/terms.html`；「隱私權政策」→ `{PUBLIC_SITE_URL}/privacy.html`
    - 主要按鈕（postback，陶土色）：「我已滿 18 歲，同意並開始」
  - **同意完成**：
    - 文字「謝謝！最後一步：填寫個人檔案，我才能幫你算每天的目標。」
    - 按鈕「開始設定」→ `https://liff.line.me/{LIFF_ID}`
  - **歡迎回來**：「歡迎回來！你的紀錄都還在。」

- [ ] **Step 1: 寫失敗的測試**（用 `create_app` 注入假的 `ApiClient` 與 `LineReplier`；簽章用測試 secret 自己算）：
  - `test_bad_signature_returns_400_and_calls_nothing`
  - `test_empty_events_verify_request_returns_200`：LINE 的 Verify 按鈕會送這種請求
  - `test_follow_unconsented_replies_welcome_with_consent_postback`
  - `test_follow_consented_replies_welcome_back`
  - `test_consent_postback_records_and_replies_liff_link`
  - `test_message_before_consent_replies_welcome_again`
  - `test_unfollow_calls_api_and_does_not_reply`
  - `test_chinese_text_body_signature_verified_on_raw_bytes`
  - `test_health_needs_no_settings`
- [ ] **Step 2: 執行** `cd apps/bot && uv run pytest -q`。Expected：FAIL。
- [ ] **Step 3: 實作。** 先執行 `uv add line-bot-sdk google-auth httpx`。處理事件前呼叫 `show_loading`（LINE loading animation API）。
- [ ] **Step 4: 執行** `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`。Expected：PASS。
- [ ] **Step 5: Commit** `feat(bot): verify webhooks and run first-use consent flow`

### Task 6: LIFF 登入、首頁與條款頁

**Files:**

- Create: `apps/liff/src/auth.ts`、`apps/liff/src/theme.ts`、`apps/liff/public/terms.html`、`apps/liff/public/privacy.html`
- Modify: `apps/liff/src/App.tsx`、`App.test.tsx`、`main.tsx`、`index.html`、`apps/liff/package.json`（加入 `@line/liff`）
- Test: `apps/liff/src/App.test.tsx`、`apps/liff/src/auth.test.ts`

**Interfaces:**

- Consumes: Task 3 的 `/auth/liff`、`/me`、`LiffAuthResponse`、`ApiError`；shared 的 `tokensCss`、`fontFamily`
- Produces:
  - `type AuthState = { kind: "loading" } | { kind: "ready"; displayName: string } | { kind: "consent_required" } | { kind: "error" }`
  - `login(deps: { liff: LiffLike; apiUrl: string; fetchImpl?: typeof fetch }): Promise<AuthState>`
    - 呼叫 `liff.init({ liffId })`
    - 沒登入就 `liff.login()`，回傳 loading
    - 拿到 `getIDToken()` 後呼叫 `POST {apiUrl}/auth/liff`
    - 回 403 → `consent_required`；回 200 → `ready`
    - token 只存在 module 變數，不寫 storage
  - `App({ state })` 依狀態顯示對應畫面
- 設定：`VITE_LIFF_ID`、`VITE_API_URL` 在 build 時注入
- 畫面（依 §10.1 方向 C；`theme.ts` 在 `main.tsx` 把 `tokensCss()` 加進 `<style>`；Google Fonts 的 `<link>` 放在 `index.html`）：
  - `ready`：Noto Serif TC 900 標題「嗨，{displayName}」；卡片內文「帳號已連結完成。個人檔案設定會在下一個版本開放。」
  - `consent_required`：標題「還差一步」；內文「請回到 LINE 聊天室，按下「我已滿 18 歲，同意並開始」後再打開這個頁面。」；按鈕「回到聊天室」（`liff.closeWindow()`）
  - `error`：「連線出了點問題，請稍後再試。」加上「重新整理」按鈕
  - `loading`：「載入中…」
- 條款頁與隱私頁：
  - 靜態 HTML，套用相同的 token 顏色與字體，頂端標示「草稿，上線前需法律審閱」與「版本 2026-10-19」
  - 隱私權政策必須涵蓋 §8.2：
    - 蒐集項目：LINE 名稱與 userId、身體數據、飲食與照片、訓練
    - 使用目的
    - 保存期限：照片 90 天；刪除帳號後 7 天內刪除
    - 照片與飲食資料會傳給 AI 服務供應商（Anthropic）處理
    - 使用者權利：匯出、刪除
  - 服務條款涵蓋：
    - 18 歲以上
    - 非醫療建議
    - 服務可能變更
    - 濫用處理

- [ ] **Step 1: 寫失敗的測試**：
  - `auth.test.ts`，用假的 liff 與 fetch：
    - `logs in when not logged in`
    - `returns ready with display name`
    - `maps 403 to consent_required`
    - `maps network failure to error`
  - `App.test.tsx`，四種狀態各一個：
    - 標題文字正確
    - `consent_required` 有「回到聊天室」button
- [ ] **Step 2: 執行** `npm test -w @gac/liff`。Expected：FAIL。
- [ ] **Step 3: 實作。** `npm i -w @gac/liff @line/liff`。
- [ ] **Step 4: 執行** `npm test -w @gac/liff && npm run build -w @gac/liff && npm run lint`。Expected：PASS，且 `dist/terms.html` 存在。
- [ ] **Step 5: Commit** `feat(liff): add LIFF login, home and policy drafts`

### Task 7: 基礎設施、部署設定與 LINE 設定手冊

**Files:**

- Modify: `infra/versions.tf`（新增 `hashicorp/random ~> 3.0`，並更新 lock 檔）
- Modify: `infra/variables.tf`（新增 `line_login_channel_id`、`liff_id`，預設 `""`）
- Modify: `infra/secrets.tf`（新增 secret 與 IAM）
- Modify: `infra/run.tf`（新增 env）、`infra/tests/core.tftest.hcl`
- Modify: `.github/workflows/deploy.yml`（liff build 加入 `VITE_LIFF_ID: ${{ vars.LIFF_ID }}`、`VITE_API_URL: ${{ vars.API_URL }}`）
- Create: `docs/line-setup.md`；Modify: `infra/README.md`（連到 line-setup，並補上 `LIFF_ID`、`API_URL` 兩個變數）

**Interfaces:**

- 新 secret：
  - `line-channel-secret`、`line-channel-access-token`：沒有 version，由使用者自己加入
  - `api-session-secret`：version 用 `random_password`（48 字元）產生
- 服務 URL 用固定格式，避免 Terraform 自我參照：
  - `local.api_url = "https://api-${data.google_project.this.number}.${var.region}.run.app"`
  - `local.public_site_url = "https://${var.project_id}-liff.web.app"`
- `api` 的 env：
  - 一般值：`INTERNAL_AUDIENCE=gac-api-internal`、`BOT_SA_EMAIL`（`bot-runtime` 的 email）、`LINE_LOGIN_CHANNEL_ID`（變數）、`CORS_ORIGIN=local.public_site_url`
  - 來自 secret：`DATABASE_URL`（`database-url`）、`SESSION_SECRET`（`api-session-secret`）
- `bot` 的 env：
  - 一般值：`API_URL=local.api_url`、`INTERNAL_AUDIENCE`、`LIFF_ID`（變數）、`PUBLIC_SITE_URL`
  - 來自 secret：`LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`
- IAM：
  - `bot-runtime` 對兩個 LINE secret 有 `secretAccessor`
  - `api-runtime` 對 `api-session-secret` 有 `secretAccessor`（對 `database-url` 已經有）
- `docs/line-setup.md`（繁中，使用者操作）：
  1. 在 LINE Developers 建立 Provider
  2. 用 LINE Official Account Manager 建立官方帳號，啟用 Messaging API，並選擇同一個 Provider
  3. 回應設定：
     - 關閉自動回應與加入好友的歡迎訊息
     - 開啟 Webhook，URL 填 `<bot_url>/webhook`
     - 按 Verify
  4. 發行長期 channel access token
  5. 在**同一個 Provider** 建立 LINE Login channel（同一個 Provider 的 userId 才會一致）
  6. 在這個 channel 新增 LIFF app：
     - Size：Full
     - Endpoint：`https://gym-assistant-coach-4734-liff.web.app`
     - Scope：`openid`、`profile`
  7. 把 channel secret 與 access token 寫進 Secret Manager，指令與 `database-url` 相同（先 `read -rs`，再用 `printf` 寫入）
  8. 回報 LINE Login channel ID 與 LIFF ID（兩者都不是機密）

- [ ] **Step 1: 寫失敗的 terraform test** `core.tftest.hcl`：
  - api container 的 env 包含 `INTERNAL_AUDIENCE = "gac-api-internal"`，且 `SESSION_SECRET` 來自 `api-session-secret`
  - bot 的 env 包含 `LINE_CHANNEL_SECRET`，來自 `line-channel-secret`
  - `API_URL` 以 `https://api-` 開頭
- [ ] **Step 2: 執行** `terraform -chdir=infra init -backend=false -upgrade && terraform -chdir=infra test`。Expected：FAIL。
- [ ] **Step 3: 實作。** Terraform 改動照上面的 Interfaces；更新 deploy.yml；撰寫兩份文件。
- [ ] **Step 4: 執行** `terraform -chdir=infra fmt -check -recursive && terraform -chdir=infra validate && terraform -chdir=infra test && npm run lint`。Expected：PASS。
- [ ] **Step 5: Commit** `feat(infra): wire LINE secrets, session secret and service env`

### Task 8: 上線（營運步驟，每一步對外動作都先經使用者確認）

- [ ] **Step 1: 使用者完成 `docs/line-setup.md` 第 1–8 步。** Agent 確認兩個 LINE secret 都有 version（只看 version 清單，不讀值），並把 LINE Login channel ID 與 LIFF ID 寫進 `infra/terraform.tfvars`。
- [ ] **Step 2: Terraform。** 執行 `terraform plan`，把摘要給使用者看，經使用者同意後才 `apply`。Expected：兩個服務的新 revision 正常，`/health` 回 ok。
- [ ] **Step 3: 設定 GitHub 變數** `LIFF_ID`、`API_URL`。
- [ ] **Step 4: 開 PR、等 CI 綠燈。** 經使用者同意後合併，自動部署會跑 migration 0001。
- [ ] **Step 5: 端到端驗收（使用者用手機）：**
  1. 加好友，收到歡迎卡片
  2. 按「我已滿 18 歲，同意並開始」，收到「開始設定」按鈕
  3. 按下按鈕，LIFF 顯示「嗨，{自己的 LINE 名稱}」
  4. 在開始同意流程前、或用另一支沒同意的帳號開 LIFF，應看到「還差一步」
- [ ] **Step 6: 檢查 log。** Cloud Logging 裡不能出現 secret、ID token 或 access token。
