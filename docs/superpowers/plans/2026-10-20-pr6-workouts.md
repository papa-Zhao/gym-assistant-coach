# PR 6: Workouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 能在 LIFF 完整記錄一次訓練（spec §10 PR 6 完成條件）。內容包括：動作庫、從範本或空白開始、記錄每組、帶出上次重量與漸進超負荷建議、偵測個人最佳紀錄（PR）並在聊天室恭喜、存成範本、本週各肌群組數。

**Architecture:**

- `packages/shared` 放純函式：估算 1RM（Epley 公式）、漸進超負荷建議、本週範圍（台北時區的週一到週日）、訓練量。
- `api` 新增 6 張表（spec §5 的 5 張，加上 1 張「本次訓練的動作清單」），以及動作庫種子資料、訓練 API。
- LIFF 實作開始畫面、訓練進行中畫面、結束摘要。
- 個人最佳紀錄的恭喜訊息：LIFF 結束訓練時用 `liff.sendMessages` 以使用者身分送出固定文字「完成今天的訓練」。這會觸發 webhook 並取得 reply token，bot 再用這個 reply token 回覆摘要與恭喜，不消耗 push 額度（spec §6.4）。

**Tech Stack:** 沿用現有技術，不新增套件。有一個新的 migration（0003）。

**Spec:** [docs/specs/2026-10-15-gym-assistant-coach-design.md](../../specs/2026-10-15-gym-assistant-coach-design.md) §5（`exercises`、`workout_sessions`、`workout_sets`、`workout_templates`／`template_items`）、§6.4、§10 PR 6、§10.1 設計稿（LIFF「訓練進行中」、Flex 今日總覽的訓練列）。

## Global Constraints

- 沿用前幾個 PR 的所有限制：
  - `api` 是唯一的資料庫存取者
  - bot→api 用 Google ID token；LIFF→api 用 session，在 `onRequest` 驗證，每個人只能存取自己的資料
  - 錯誤只回 `ApiError`
  - 「哪一天」一律用 Asia/Taipei 的 `taipeiDate`
  - 繁體中文；按鈕高度 ≥ 44px；畫面只用設計 token
  - 不記錄 id、token 或內容
- **CORS：** 這個 PR 第一次用到 `DELETE`，必須把 `DELETE` 加進 CORS 允許的方法，並寫測試確認 LIFF 網域的 DELETE 預檢會通過。（PR 4 曾因為漏了 PUT，所有單元測試都沒抓到。）
- 肌群（`MuscleGroup`）：`chest` 胸、`back` 背、`shoulders` 肩、`biceps` 二頭、`triceps` 三頭、`quads` 股四頭、`hamstrings` 腿後、`glutes` 臀、`calves` 小腿、`core` 核心。
- 器材（`Equipment`）：`barbell` 槓鈴、`dumbbell` 啞鈴、`machine` 機械、`cable` 滑輪、`bodyweight` 自體重量、`other` 其他。
- 每組的合理範圍：
  - 次數 1–100 的整數
  - 重量 0–500 kg，一位小數；0 代表自體重量
  - RPE 1–10，可省略，0.5 為一級
- **估算 1RM（Epley）：** `weight × (1 + reps / 30)`
  - 只計算 1–12 下且重量 > 0 的組
  - 結果四捨五入到一位小數
- **個人最佳紀錄（PR）：** 本次訓練某動作的最佳估算 1RM，**嚴格大於**這個使用者以前所有已完成訓練中，同一動作的最佳估算 1RM。
  - 第一次做的動作不算 PR，避免第一次訓練時每個動作都跳恭喜。
- **漸進超負荷建議：** 上次做這個動作時，每一組的次數都 ≥ 目標次數，就建議「上次最重的重量 + 2.5 kg」。
  - 目標次數：從範本開始時用範本的次數；空白開始時用上次第一組的次數。
- **本週：** 台北時區的週一到週日。每個肌群的組數只計入已完成的組，並以動作的主要肌群計算。
- **一次只能有一個進行中的訓練：** 已有進行中的訓練時，開始新訓練會直接回傳那一個。
- **訓練量：** Σ（重量 × 次數），只計入已完成的組。

## Review Focus

1. **中途關閉 LIFF 再打開**：要回到同一個進行中的訓練，已記錄的組都還在。由 Task 4、Task 6 測試涵蓋。
2. **第一次做某個動作**：不顯示「上次」、不建議加重、不算 PR，畫面也不能出錯。由 Task 1、Task 4 測試涵蓋。
3. **自體重量動作（重量 0）**：可以記錄，但不參與 1RM 與 PR 計算。由 Task 1、Task 4 測試涵蓋。
4. **在 LINE 以外的瀏覽器開啟，`sendMessages` 無法使用**：結束訓練仍要成功，恭喜改顯示在 LIFF 畫面上。由 Task 6 測試涵蓋。
5. **刪除範本或自訂動作**：只能刪除自己的；刪除已用於歷史紀錄的自訂動作時，不能破壞歷史資料，改成封存。由 Task 3 測試涵蓋。

---

## File Structure

| 路徑 | 職責 |
|---|---|
| `packages/shared/src/workouts.ts` | 肌群與器材常數、範圍、`estimate1RM`、`overloadHint`、`weekRange`、`volume`、API 型別 |
| `apps/api/src/db/schema.ts`、`db/migrations/0003_*.sql`、`db/migrations/0004_seed_exercises.sql` | 6 張表與動作庫種子 |
| `apps/api/src/workouts/repo.ts` | 訓練、組、範本的存取 |
| `apps/api/src/workouts/exercise-routes.ts`、`template-routes.ts`、`session-routes.ts` | LIFF 用的 API |
| `apps/api/src/internal/routes.ts`（修改） | 今日總覽的訓練摘要、訓練完成摘要 |
| `apps/bot/app/handlers.py`、`messages.py`、`api_client.py`（修改） | 「完成今天的訓練」的回覆 |
| `apps/liff/src/pages/workout/*` | 開始畫面、訓練進行中、動作選擇器、結束摘要 |
| `apps/liff/src/pages/Records.tsx`（修改） | 訓練卡片改為可用 |

---

### Task 1: 訓練計算（shared）

**Files:**

- Create: `packages/shared/src/workouts.ts`、`packages/shared/src/workouts.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**

- Produces:
  - 常數：`MUSCLE_GROUPS`、`EQUIPMENT`（中文標籤見 Global Constraints）、`SET_LIMITS = { reps: {min:1,max:100}, weightKg: {min:0,max:500}, rpe: {min:1,max:10} }`
  - `estimate1RM(weightKg, reps): number | null`：不符合條件時回傳 null
  - `bestE1RM(sets: {weightKg, reps}[]): number | null`
  - `overloadHint(last: {weightKg, reps}[], targetReps: number | null): { suggestWeightKg: number } | null`
    - `targetReps` 為 null 時，用 `last[0].reps`
    - `last` 為空陣列時回傳 null
  - `weekRange(today: string): { from: string; to: string }`：週一到週日
  - `volume(sets): number`
  - 型別：`Exercise`、`WorkoutSet`、`SessionItem`、`ActiveSession`、`FinishSummary`、`Template`、`WeekStats`
    - `ActiveSession` 的每個 item 包含 `last: { date, sets } | null` 與 `hint`

- [ ] **Step 1: 寫失敗的測試**：
  - `estimate1RM epley`：100 kg × 5 下 → 116.7
  - `estimate1RM excludes 13+ reps and zero weight`
  - `bestE1RM picks max`
  - `overloadHint all sets hit target suggests +2.5`：上次 80×8、80×8、80×8，目標 8 → 82.5
  - `overloadHint missed set gives null`：上次 80×8、80×7
  - `overloadHint blank workout uses first set reps as target`
  - `overloadHint empty last gives null`
  - `weekRange monday to sunday`：
    - 2026-10-20（週二）→ from 2026-10-19、to 2026-10-25
    - 2026-10-25（週日）→ 同一週
    - 2026-10-26（週一）→ 新的一週
  - `volume sums weight times reps`
- [ ] **Step 2: 執行** `npm test -w @gac/shared`。Expected：FAIL。
- [ ] **Step 3: 實作。** 星期幾用 `addDays` 搭配 UTC 計算，不依賴本機時區。
- [ ] **Step 4: 執行** `npm test -w @gac/shared && npm run typecheck`，以及只檢查追蹤檔案的 lint。Expected：PASS。
- [ ] **Step 5: Commit** `feat(shared): add workout calculations`

### Task 2: 資料表、動作庫種子與存取層（api）

**Files:**

- Modify: `apps/api/src/db/schema.ts`
- Create:
  - `db/migrations/0003_workouts.sql`：用 drizzle-kit 產生
  - `db/migrations/0004_seed_exercises.sql`：用 `--custom` 產生，內容手寫
  - `apps/api/src/workouts/repo.ts`
- Test: `apps/api/test/workouts-repo.test.ts`

**Interfaces:**

- 表：
  - `exercises`：
    - `id uuid pk`
    - `name_zh text not null`、`name_en text`
    - `muscle_group text not null`，check 為肌群列舉
    - `equipment text not null`，check 為器材列舉
    - `is_custom boolean not null default false`
    - `owner_user_id uuid`，references users，on delete cascade
    - `archived_at timestamptz`
    - check：`is_custom = (owner_user_id is not null)`
    - 部分唯一索引：`(name_zh)`，`where not is_custom`
  - `workout_sessions`：
    - `id uuid pk`
    - `user_id uuid`，cascade
    - `performed_on date not null`
    - `started_at timestamptz not null default now()`
    - `ended_at timestamptz`
    - `note text`
    - `template_id uuid`，references templates，on delete set null
    - `celebrated_at timestamptz`
    - 部分唯一索引：`(user_id)`，`where ended_at is null`，保證只有一個進行中的訓練
  - `workout_session_items`（spec 沒有，本計畫新增）：
    - `session_id uuid`，cascade
    - `exercise_id uuid`，references exercises
    - `position int not null`、`target_sets int`、`target_reps int`
    - pk `(session_id, exercise_id)`
  - `workout_sets`：
    - `session_id uuid`，cascade
    - `exercise_id uuid not null`
    - `set_index int not null`、`reps int not null`
    - `weight_kg numeric(5,1) not null`、`rpe numeric(3,1)`
    - `completed_at timestamptz not null default now()`
    - pk `(session_id, exercise_id, set_index)`
  - `workout_templates`：
    - `id uuid pk`
    - `user_id uuid`，cascade
    - `name text not null`
    - `created_at timestamptz not null default now()`
  - `template_items`：
    - `template_id uuid`，cascade
    - `exercise_id uuid`
    - `position int`、`sets int not null`、`reps int not null`
    - pk `(template_id, exercise_id)`
- 種子：約 40 個常見動作，每個肌群至少 3 個。
  - 例：槓鈴臥推／Barbell Bench Press／chest／barbell、槓鈴深蹲、羅馬尼亞硬舉、引體向上、啞鈴肩推、側平舉、二頭彎舉、繩索下拉、腿推、腿後彎舉、臀推、提踵、棒式……
  - 寫法：`insert … on conflict do nothing`。
- Repo（只列對外介面，皆以 `userId` 限定範圍）：
  - 動作：`listExercises(db, userId, { q?, muscle? })`、`createCustomExercise`、`archiveCustomExercise`
  - 範本：`listTemplates`、`createTemplateFromSession(db, userId, sessionId, name)`、`deleteTemplate`
  - 訓練進行中：`getActiveSession(db, userId, today)`、`startSession(db, userId, today, templateId?)`、`addItem`、`upsertSet`、`deleteSet`
  - 結束與統計：`finishSession(db, userId, sessionId) → FinishSummary`、`weekStats(db, userId, from, to)`、`latestUncelebrated(db, userId)`、`markCelebrated`、`todayWorkoutSummary(db, userId, today)`
  - `getActiveSession` 的每個 item 都附上次的組與建議：
    - 上次 = 同一動作最近一次已完成訓練的組
    - 建議 = `overloadHint`
  - `finishSession` 計算 `prs`：用 `bestE1RM` 與這個使用者以前所有已完成訓練的最佳值比較，依 Global Constraints 的規則判定

- [ ] **Step 1: 寫 schema，產生兩個 migration。** 0004 的種子手寫，並在檔頭註解說明格式。
- [ ] **Step 2: 寫失敗的測試**（必須關閉 `createTestDb`）：
  - `seed has at least 3 exercises per muscle group and unique names`
  - `custom exercise visible only to owner`
  - `archiving a used custom exercise keeps history`
  - `only one active session; starting again returns it`
  - `start from template creates items with targets`
  - `active session includes last sets and hint`
  - `first time exercise has no last and no hint`
  - `upsert set overwrites same index`
  - `finish computes volume and PRs, first-time not PR, bodyweight ignored`
  - `week stats counts completed sets by primary muscle within Mon–Sun`
  - `latestUncelebrated then markCelebrated`
  - `data is isolated per user`
- [ ] **Step 3: 執行** `npm test -w @gac/api`。Expected：FAIL。
- [ ] **Step 4: 實作。**
- [ ] **Step 5: 執行** `npm test && npm run typecheck`，以及 lint。Expected：PASS。
- [ ] **Step 6: Commit** `feat(api): add workout tables, exercise seed and repository`

### Task 3: 動作與範本 API（含 CORS DELETE）

**Files:**

- Create: `apps/api/src/workouts/exercise-routes.ts`、`template-routes.ts`
- Modify: `apps/api/src/app.ts`（註冊路由；CORS `methods` 加入 `DELETE`）
- Test: `apps/api/test/exercise-template-routes.test.ts`、`apps/api/test/auth.test.ts`（新增 DELETE 預檢測試）

**Interfaces（皆需 LIFF session，在 `onRequest` 驗證）：**

- 動作：
  - `GET /exercises?q=&muscle=` → `Exercise[]`：種子加上自己的自訂動作，排除已封存
  - `POST /exercises` → 201 `Exercise`
    - body：`{ nameZh, muscleGroup, equipment }`
    - `nameZh` 為 1–30 字
  - `DELETE /exercises/:id` → 204
    - 只能刪自己的自訂動作，否則回 404
    - 已用於歷史紀錄的改成封存
- 範本：
  - `GET /templates` → `Template[]`
  - `POST /templates` → 201 `Template`
    - body：`{ fromSessionId, name }`；`name` 為 1–30 字
    - 只能用自己已完成的訓練
  - `DELETE /templates/:id` → 204；不是自己的回 404

- [ ] **Step 1: 寫失敗的測試**：
  - `CORS preflight allows DELETE for the LIFF origin`
  - `list exercises filters by q and muscle`
  - `create custom then list includes it only for owner`
  - `delete other user's exercise is 404`
  - `create template from own finished session`
  - `template from another user's session is 404`
  - `delete template`
  - `routes need a session (401)`
- [ ] **Step 2: 執行測試**。Expected：FAIL。
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 執行** `npm test && npm run typecheck`，以及 lint。Expected：PASS。
- [ ] **Step 5: Commit** `feat(api): add exercise and template endpoints`

### Task 4: 訓練進行中 API、統計與 bot 用的內部端點

**Files:**

- Create: `apps/api/src/workouts/session-routes.ts`
- Modify: `apps/api/src/internal/routes.ts`、`apps/api/src/app.ts`
- Test: `apps/api/test/session-routes.test.ts`、`apps/api/test/internal.test.ts`（新增案例）

**Interfaces:**

- LIFF（需 session）：
  - `GET /workouts/active` → `ActiveSession | null`
  - `POST /workouts` → `ActiveSession`
    - body：`{ templateId? }`
    - 已有進行中的訓練時，直接回傳它（200）
  - `POST /workouts/:id/items` → `ActiveSession`
    - body：`{ exerciseId }`；同一個動作不重複加入
  - `PUT /workouts/:id/sets` → `ActiveSession`
    - body：`{ exerciseId, setIndex, reps, weightKg, rpe? }`
    - 值必須在 `SET_LIMITS` 範圍內
  - `DELETE /workouts/:id/sets/:exerciseId/:setIndex` → `ActiveSession`
  - `POST /workouts/:id/finish` → `FinishSummary`
    - 回傳 `{ sessionId, volumeKg, exerciseCount, setCount, prs: [{ exerciseId, nameZh, e1rm, weightKg, reps }] }`
    - 至少要有一組已完成，否則回 409 `conflict`
  - `GET /workouts/week` → `WeekStats`：`{ from, to, sessions, setsByMuscle: Record<MuscleGroup, number> }`
  - 不是自己的訓練一律回 404
- bot（需服務 token）：
  - `POST /internal/workouts/celebrate`
    - body：`{ lineUserId }`
    - 回傳最近一次今天完成、而且還沒恭喜過的訓練摘要（含 PR），並標記為已恭喜
    - 沒有的話回 `{ summary: null }`
  - 修改 `/internal/users/today`：`workoutSummary` 改為今天已完成訓練的摘要
    - 格式：`"{範本名稱或「訓練」}・{n} 個動作・{volume} kg"`
    - 今天沒有訓練時為 null
- 今天的日期一律用 `taipeiDate(deps.now())`。

- [ ] **Step 1: 寫失敗的測試**：
  - `start, add item, record sets, finish returns PRs`
  - `starting again returns the same active session`
  - `reopen returns recorded sets`
  - `set out of range is 400`
  - `finish with no sets is 409`
  - `other user's session is 404`
  - `week stats after finish`
  - `celebrate returns summary once then null`
  - `today summary shows workout after finish`
- [ ] **Step 2: 執行測試**。Expected：FAIL。
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 執行** `npm test && npm run typecheck`，以及 lint。Expected：PASS。
- [ ] **Step 5: Commit** `feat(api): add workout session endpoints and summaries`

### Task 5: bot「完成今天的訓練」回覆

**Files:**

- Modify: `apps/bot/app/handlers.py`、`messages.py`、`api_client.py`
- Test: `apps/bot/tests/test_webhook.py`（新增案例）

**Interfaces:**

- Consumes: Task 4 的 `/internal/workouts/celebrate`
- Produces:
  - 已同意的使用者傳來的文字，在 NFKC 正規化並去掉頭尾空白後，**完全等於**「完成今天的訓練」時，呼叫 `celebrate`
    - 有摘要時，回覆 Flex `workout_done`
    - 沒有摘要時，回覆「今天還沒有完成的訓練紀錄喔。」
  - `messages.workout_done(summary, liff_id)`：
    - 標題「今天辛苦了！」
    - 內文：動作數、組數、總訓練量
    - 每個 PR 一行，例如「新紀錄：槓鈴深蹲 估算 1RM 116.7 kg（100 kg × 5）」，用 accent-soft 色塊標示
    - 按鈕「看今天的總覽」：postback `action=today`
    - `altText`：「訓練完成」
  - 這個文字不是身體數據指令，也不是一般訊息，要在身體數據指令之前判斷。

- [ ] **Step 1: 寫失敗的測試**：
  - `test_workout_done_text_replies_summary_with_prs`
  - `test_workout_done_without_summary`
  - `test_workout_done_before_consent_replies_welcome`
  - `test_workout_done_flex_is_valid_for_sdk`（用 `_to_sdk` 驗證）
- [ ] **Step 2: 執行測試**。Expected：FAIL。
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 執行** `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`。Expected：PASS。
- [ ] **Step 5: Commit** `feat(bot): celebrate finished workouts`

### Task 6: LIFF 訓練畫面

**Files:**

- Create: `apps/liff/src/pages/workout/WorkoutHome.tsx`、`ActiveWorkout.tsx`、`ExercisePicker.tsx`、`FinishSummary.tsx`（各有測試）
- Modify: `apps/liff/src/App.tsx`（`/workout`）、`apps/liff/src/auth.ts`（在 `LiffLike` 加上 `sendMessages`）、`apps/liff/src/pages/Records.tsx`（訓練卡片）

**Interfaces（依 §10.1 設計稿 Liff-Workout）：**

- **WorkoutHome**（沒有進行中的訓練時）：
  - 標題「記訓練」
  - 「本週訓練 N 次」與各肌群組數的橫條（只列 > 0 的肌群）
  - 範本列表，每個有「開始」與「刪除」（刪除前要確認）
  - 主要按鈕「空白開始」
  - 有進行中的訓練時，直接顯示 ActiveWorkout
- **ActiveWorkout**：
  - 頂部：「{範本名稱或「訓練進行中」}」與經過時間 mm:ss
  - 每個動作一張卡：
    - 名稱用 serif 字體
    - 有上次紀錄時顯示「上次（M/D）：80 kg × 8、8、8」
    - 有建議時顯示 accent-soft 框：「上次每組都做到了，今天試試 82.5 kg？」
    - 組列表：組號、重量、次數、RPE（選填）
    - 已完成的組顯示 ✓ 並可修改；新的一組預填上一組的值
    - 「完成這組」送出 `PUT`；「＋ 加一組」
  - 底部：「＋ 加動作」開啟 ExercisePicker；「結束訓練」需確認後才送出 finish
- **ExercisePicker**：
  - 搜尋框，加上肌群篩選 chip
  - 點選即加入訓練
  - 「新增自訂動作」：名稱、肌群、器材
- **FinishSummary**：
  - 總訓練量、動作數、組數
  - 有 PR 時用 accent-soft 卡逐一列出
  - 「存成範本」：輸入名稱 →「已存成範本」
  - 結束後呼叫 `liff.sendMessages([{ type: "text", text: "完成今天的訓練" }])`
    - 成功：顯示「已傳到聊天室」與「回到聊天室」（`closeWindow`）
    - 失敗或不在 LINE 內：只顯示畫面上的摘要，不顯示錯誤
- **Records 頁**：訓練卡片改為可用。顯示「本週訓練 N 次」，連到 `/workout`。

- [ ] **Step 1: 寫失敗的測試**（fetch 與 liff 都用假的）：
  - `home shows week stats and templates; blank start calls POST /workouts`
  - `resume active session on open`
  - `last sets and hint are shown; first-time exercise shows none`
  - `complete set sends PUT with prefilled values`
  - `invalid reps shows field error`
  - `picker filters and adds exercise; custom exercise form`
  - `finish requires confirm and shows PRs`
  - `finish sends chat message; failure still shows summary`
  - `save as template`
  - `records training card links to /workout`
- [ ] **Step 2: 執行** `npm test -w @gac/liff`。Expected：FAIL。
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 執行** `npm test -w @gac/liff && npm run build -w @gac/liff && npm run typecheck`，以及 lint。Expected：PASS。
- [ ] **Step 5: Commit** `feat(liff): record workouts`

### Task 7: 上線（營運步驟，每一步對外動作都先經使用者確認）

- [ ] **Step 1: 使用者在 LINE Developers 的 LIFF app 加上 `chat_message.write` scope。** 這是使用者自己操作的步驟；沒有這個 scope，`sendMessages` 會失敗，但結束訓練仍可完成。
- [ ] **Step 2: 開 PR、等 CI 綠燈。** 經使用者同意後合併；部署會跑 migration 0003 與 0004。
- [ ] **Step 3: 部署後從外部確認。** `OPTIONS /templates/x` 的 DELETE 預檢通過；`/workout` 頁回 200。
- [ ] **Step 4: 手機驗收：**
  1. 空白開始，加兩個動作，各記兩組，結束
  2. 聊天室收到「今天辛苦了！」
  3. 存成範本
  4. 再用範本開始一次，看到「上次」與建議；加重後結束，收到 PR 恭喜
  5. 今日總覽顯示訓練摘要
- [ ] **Step 5: 檢查 log。** 不能有 token 或 userId。
