# PR 6: Workouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 能在 LIFF 完整記錄一次訓練（spec §10 PR 6 完成條件）。內容包括：中英文動作庫（重訓與有氧）、從範本或空白開始、記錄重訓的每組與有氧的時間和距離、帶出上次重量與漸進超負荷建議、偵測個人最佳紀錄（PR）並在聊天室恭喜、存成範本、本週各肌群組數。

**Architecture:**

- `packages/shared` 放純函式：估算 1RM（Epley 公式）、漸進超負荷建議、本週範圍（台北時區的週一到週日）、訓練量。
- `api` 新增 7 張表（spec §5 的 5 張，加上「本次訓練的動作清單」與「有氧紀錄」），以及動作庫種子資料、訓練 API。
- LIFF 實作開始畫面、訓練進行中畫面、結束摘要。
- 訓練完成通知（含個人最佳紀錄恭喜）用 **push 訊息**（2026-10-20 使用者決定可消耗 push 額度）：
  - LIFF 呼叫 `api` 的 finish 後，`api` 以自己的服務帳號取得 Google ID token，呼叫 `bot` 的 `/internal/notify/workout-finished`
  - `bot` 驗證 token 後 push Flex 給使用者
  - 只有 `bot` 持有 LINE token，維持原本的職責分工
  - 通知是盡力而為：push 失敗（例如月額度用完）時，結束訓練仍成功，摘要照樣顯示在 LIFF

**Tech Stack:** 沿用現有技術，不新增套件。有兩個新的 migration（0003 建表、0004 動作庫種子）。

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
- **動作種類（`ExerciseKind`）：** `strength` 重訓、`cardio` 有氧。重訓動作必須有肌群；有氧動作的肌群為 null。
- **器材（`Equipment`）與器材類別（`EquipmentCategory`）：** 資料庫只存器材，類別一律由 shared 的 `equipmentCategory(equipment)` 推導，不另外存，避免兩者不一致。

  | 類別 | 器材 |
  |---|---|
  | `machine` 機械式 | `selectorized_machine` 插銷式機械、`plate_loaded_machine` 掛片式機械 |
  | `semi_machine` 半機械式 | `smith_machine` 史密斯機、`cable` 滑輪 |
  | `free_weight` 自由重量 | `barbell` 槓鈴、`dumbbell` 啞鈴、`kettlebell` 壺鈴、`ez_bar` 曲槓 |
  | `bodyweight` 徒手 | `bodyweight` 自體重量 |
  | `cardio_equipment` 有氧器材 | `treadmill` 跑步機、`stair_climber` 階梯機、`stationary_bike` 飛輪／固定式腳踏車、`rower` 划船機、`elliptical` 橢圓機、`none` 無器材（例如戶外跑步、跳繩） |

- **名稱：** 內建動作一定有中文與英文名稱，並有固定的英文代號 `slug`（例如 `barbell-bench-press`），未來可用來對應教學影片。自訂動作的英文名稱選填，沒有 slug。畫面上中英並列，搜尋同時比對中文與英文。
- **有氧紀錄的合理範圍：**
  - 時間 1–600 分鐘的整數（必填）
  - 距離 0–100 km，兩位小數（選填）
  - 坡度 0–40%，一位小數（選填，跑步機與爬坡）
  - 速度 0–40 km/h，一位小數（選填）
  - 阻力或等級 1–30 的整數（選填，階梯機、飛輪、划船機、橢圓機）
- **有氧不計入** 1RM、PR、訓練量與肌群組數；本週統計與摘要另外顯示「有氧分鐘數」。
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
3. **自體重量（重量 0）與有氧動作**：可以記錄，但不參與 1RM、PR 與訓練量；有氧只計入有氧分鐘數。由 Task 1、Task 4 測試涵蓋。
4. **push 失敗（額度用完、bot 暫時無法連線、逾時）**：結束訓練仍要成功並回傳摘要，`notified` 為 false；不得重試到使用者重複收到。由 Task 4、Task 5 測試涵蓋。
5. **刪除範本或自訂動作**：只能刪除自己的；刪除已用於歷史紀錄的自訂動作時，不能破壞歷史資料，改成封存。由 Task 3 測試涵蓋。

---

## File Structure

| 路徑 | 職責 |
|---|---|
| `packages/shared/src/workouts.ts` | 肌群、器材與器材類別常數、有氧範圍、`estimate1RM`、`overloadHint`、`weekRange`、`volume`、API 型別 |
| `apps/api/src/db/schema.ts`、`db/migrations/0003_*.sql`、`db/migrations/0004_seed_exercises.sql` | 7 張表與動作庫種子（重訓與有氧，中英文） |
| `apps/api/src/workouts/repo.ts` | 訓練、組、範本的存取 |
| `apps/api/src/workouts/exercise-routes.ts`、`template-routes.ts`、`session-routes.ts` | LIFF 用的 API |
| `apps/api/src/internal/routes.ts`（修改） | 今日總覽的訓練摘要、訓練完成摘要 |
| `apps/api/src/notify/bot.ts` | api→bot 的通知 client（Google ID token） |
| `apps/bot/app/internal.py`、`messages.py`、`line_replier.py`（修改） | 驗證 api 的 token 並 push 訓練完成 Flex |
| `infra/run.tf`（修改） | api 與 bot 互相呼叫所需的環境變數 |
| `apps/liff/src/pages/workout/*` | 開始畫面、訓練進行中、動作選擇器、結束摘要 |
| `apps/liff/src/pages/Records.tsx`（修改） | 訓練卡片改為可用 |

---

### Task 1: 訓練計算（shared）

**Files:**

- Create: `packages/shared/src/workouts.ts`、`packages/shared/src/workouts.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**

- Produces:
  - 常數（中文標籤見 Global Constraints）：
    - `MUSCLE_GROUPS`、`EXERCISE_KINDS`、`EQUIPMENT`、`EQUIPMENT_CATEGORIES`
    - `SET_LIMITS = { reps: {min:1,max:100}, weightKg: {min:0,max:500}, rpe: {min:1,max:10} }`
    - `CARDIO_LIMITS = { durationMin: {min:1,max:600}, distanceKm: {min:0,max:100}, inclinePct: {min:0,max:40}, speedKmh: {min:0,max:40}, level: {min:1,max:30} }`
  - `equipmentCategory(equipment: Equipment): EquipmentCategory`：依 Global Constraints 的對照表
  - `estimate1RM(weightKg, reps): number | null`：不符合條件時回傳 null
  - `bestE1RM(sets: {weightKg, reps}[]): number | null`
  - `overloadHint(last: {weightKg, reps}[], targetReps: number | null): { suggestWeightKg: number } | null`
    - `targetReps` 為 null 時，用 `last[0].reps`
    - `last` 為空陣列時回傳 null
  - `weekRange(today: string): { from: string; to: string }`：週一到週日
  - `volume(sets): number`
  - 型別：`Exercise`、`WorkoutSet`、`CardioEntry`、`SessionItem`、`ActiveSession`、`FinishSummary`、`Template`、`WeekStats`
    - `Exercise`：`{ id, slug: string | null, nameZh, nameEn: string | null, kind, muscleGroup: MuscleGroup | null, equipment, equipmentCategory, isCustom }`
    - `CardioEntry`：`{ entryIndex, durationMin, distanceKm?, inclinePct?, speedKmh?, level? }`
    - 重訓 item 帶 `sets`，有氧 item 帶 `cardio`
    - `ActiveSession` 的每個 item 包含 `last: { date, sets } | null` 與 `hint`

- [ ] **Step 1: 寫失敗的測試**：
  - `estimate1RM epley`：100 kg × 5 下 → 116.7
  - `estimate1RM excludes 13+ reps and zero weight`
  - `bestE1RM picks max`
  - `overloadHint all sets hit target suggests +2.5`：上次 80×8、80×8、80×8，目標 8 → 82.5
  - `overloadHint missed set gives null`：上次 80×8、80×7
  - `overloadHint blank workout uses first set reps as target`
  - `overloadHint empty last gives null`
  - `equipmentCategory maps every equipment`：EQUIPMENT 的每個值都對到一個類別；例如 smith_machine → semi_machine、kettlebell → free_weight、treadmill → cardio_equipment
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
    - `slug text unique`：內建動作必填，自訂動作為 null
    - `name_zh text not null`、`name_en text`
    - `kind text not null`，check 為 `strength`／`cardio`
    - `muscle_group text`，check 為肌群列舉；check：`kind = 'cardio' or muscle_group is not null`
    - `equipment text not null`，check 為器材列舉
    - `is_custom boolean not null default false`
    - `owner_user_id uuid`，references users，on delete cascade
    - `archived_at timestamptz`
    - check：`is_custom = (owner_user_id is not null)`
    - check：`is_custom or (slug is not null and name_en is not null)`
    - 部分唯一索引：`(name_zh)`，`where not is_custom`
  - `workout_sessions`：
    - `id uuid pk`
    - `user_id uuid`，cascade
    - `performed_on date not null`
    - `started_at timestamptz not null default now()`
    - `ended_at timestamptz`
    - `note text`
    - `template_id uuid`，references templates，on delete set null
    - `notified_at timestamptz`：push 成功後寫入，避免重複通知
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
  - `cardio_entries`：
    - `session_id uuid`，cascade
    - `exercise_id uuid not null`
    - `entry_index int not null`
    - `duration_min int not null`
    - `distance_km numeric(5,2)`、`incline_pct numeric(3,1)`、`speed_kmh numeric(3,1)`、`level int`
    - `completed_at timestamptz not null default now()`
    - pk `(session_id, exercise_id, entry_index)`
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
- 種子（`slug`、中文、英文、種類、肌群、器材全部必填）：
  - 重訓約 45 個，每個肌群至少 3 個；機械式、半機械式、自由重量、徒手四類都要有
    - 例：`barbell-bench-press` 槓鈴臥推／Barbell Bench Press／chest／barbell
    - 例：`smith-machine-squat` 史密斯機深蹲／Smith Machine Squat／quads／smith_machine
    - 例：`chest-press-machine` 坐姿胸推機／Chest Press Machine／chest／selectorized_machine
    - 例：`lat-pulldown` 滑輪下拉／Lat Pulldown／back／cable
    - 例：`pull-up` 引體向上／Pull-up／back／bodyweight
  - 有氧至少 8 個：
    - `treadmill-run` 跑步機跑步／Treadmill Run／treadmill
    - `treadmill-incline-walk` 跑步機爬坡走／Treadmill Incline Walk／treadmill
    - `outdoor-run` 戶外跑步／Outdoor Run／none
    - `stair-climber` 階梯機／Stair Climber／stair_climber
    - `stationary-bike` 飛輪／Stationary Bike／stationary_bike
    - `rowing-machine` 划船機／Rowing Machine／rower
    - `elliptical` 橢圓機／Elliptical／elliptical
    - `jump-rope` 跳繩／Jump Rope／none
  - 寫法：`insert … on conflict (slug) do nothing`。
- Repo（只列對外介面，皆以 `userId` 限定範圍）：
  - 動作：`listExercises(db, userId, { q?, muscle? })`、`createCustomExercise`、`archiveCustomExercise`
  - 範本：`listTemplates`、`createTemplateFromSession(db, userId, sessionId, name)`、`deleteTemplate`
  - 訓練進行中：`getActiveSession(db, userId, today)`、`startSession(db, userId, today, templateId?)`、`addItem`、`upsertSet`、`deleteSet`、`upsertCardio`、`deleteCardio`
  - `upsertSet` 只接受重訓動作，`upsertCardio` 只接受有氧動作；用錯種類時丟出錯誤，由 route 回 400
  - 結束與統計：`finishSession(db, userId, sessionId) → FinishSummary`、`weekStats(db, userId, from, to)`、`markNotified(db, sessionId)`、`todayWorkoutSummary(db, userId, today)`
  - `getActiveSession` 的每個 item 都附上次的組與建議：
    - 上次 = 同一動作最近一次已完成訓練的組
    - 建議 = `overloadHint`
  - `finishSession` 計算 `prs`：用 `bestE1RM` 與這個使用者以前所有已完成訓練的最佳值比較，依 Global Constraints 的規則判定

- [ ] **Step 1: 寫 schema，產生兩個 migration。** 0004 的種子手寫，並在檔頭註解說明格式。
- [ ] **Step 2: 寫失敗的測試**（必須關閉 `createTestDb`）：
  - `seed has at least 3 exercises per muscle group and unique names`
  - `seed covers all equipment categories and has 8+ cardio exercises, all with slug and English name`
  - `search matches English name`：例如 `bench` 找得到槓鈴臥推
  - `record cardio entry and reopen`
  - `cardio is excluded from volume, PRs and muscle sets`
  - `custom exercise visible only to owner`
  - `archiving a used custom exercise keeps history`
  - `only one active session; starting again returns it`
  - `start from template creates items with targets`
  - `active session includes last sets and hint`
  - `first time exercise has no last and no hint`
  - `upsert set overwrites same index`
  - `finish computes volume and PRs, first-time not PR, bodyweight ignored`
  - `week stats counts completed sets by primary muscle within Mon–Sun`
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
  - `GET /exercises?q=&muscle=&category=&kind=` → `Exercise[]`：種子加上自己的自訂動作，排除已封存；`q` 同時比對中文與英文名稱
  - `POST /exercises` → 201 `Exercise`
    - body：`{ nameZh, nameEn?, kind, muscleGroup?, equipment }`
    - `nameZh` 為 1–30 字，`nameEn` 為 1–60 字；重訓必須有 `muscleGroup`
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
  - `list exercises filters by q (zh and en), muscle, category and kind`
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
  - `PUT /workouts/:id/cardio` → `ActiveSession`
    - body：`{ exerciseId, entryIndex, durationMin, distanceKm?, inclinePct?, speedKmh?, level? }`
    - 值必須在 `CARDIO_LIMITS` 範圍內；對重訓動作呼叫時回 400
  - `DELETE /workouts/:id/cardio/:exerciseId/:entryIndex` → `ActiveSession`
  - `POST /workouts/:id/finish` → `FinishSummary`
    - 回傳 `{ sessionId, volumeKg, exerciseCount, setCount, cardioMinutes, prs: [{ exerciseId, nameZh, nameEn, e1rm, weightKg, reps }], notified: boolean }`
    - 至少要有一組重訓或一筆有氧，否則回 409 `conflict`
  - `GET /workouts/week` → `WeekStats`：`{ from, to, sessions, setsByMuscle: Record<MuscleGroup, number>, cardioMinutes }`
  - 不是自己的訓練一律回 404
- 通知：
  - `AppDeps` 新增 `notifyWorkoutFinished: (lineUserId: string, summary: FinishSummary, templateName: string | null) => Promise<void>`
  - finish 在交易提交後呼叫它，並設 5 秒逾時；成功就 `markNotified` 並回 `notified: true`，失敗或逾時就回 `notified: false`，只記錄錯誤名稱
  - 已通知過的訓練不會再通知（finish 已結束的訓練回 409）
  - 正式實作 `createBotNotifier(botUrl, audience)`（`apps/api/src/notify/bot.ts`）：
    - 用 `google-auth-library` 的 `GoogleAuth().getIdTokenClient(audience)` 取得 ID token
    - `POST {botUrl}/internal/notify/workout-finished`，body `{ lineUserId, summary, templateName }`
    - 非 2xx 一律 reject
  - `loadConfig` 新增必填 `BOT_URL`（https）與 `BOT_AUDIENCE`；`.github/workflows/ci.yml` 的 images job 要補上假值，否則容器啟動失敗
- bot（需服務 token）：
  - 修改 `/internal/users/today`：`workoutSummary` 改為今天已完成訓練的摘要
    - 格式：`"{範本名稱或「訓練」}・{n} 個動作・{volume} kg"`；有有氧時再加「・有氧 {m} 分鐘」；只有有氧時省略訓練量
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
  - `cardio entry recorded, out-of-range is 400, wrong kind is 400`
  - `finish with only cardio succeeds and reports cardio minutes`
  - `finish notifies bot with summary and sets notified true`
  - `notifier failure or timeout still finishes with notified false`
  - `finishing an already finished session is 409 and does not notify again`
  - `createBotNotifier posts with ID token and rejects non-2xx`（fetch 與 token client 用假的）
  - `loadConfig requires BOT_URL and BOT_AUDIENCE`
  - `today summary shows workout after finish`
- [ ] **Step 2: 執行測試**。Expected：FAIL。
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 執行** `npm test && npm run typecheck`，以及 lint。Expected：PASS。
- [ ] **Step 5: Commit** `feat(api): add workout session endpoints and summaries`

### Task 5: bot 訓練完成推播

**Files:**

- Create: `apps/bot/app/internal.py`、`apps/bot/tests/test_internal.py`
- Modify: `apps/bot/app/handlers.py`（掛上 internal router）、`settings.py`、`messages.py`、`line_replier.py`

**Interfaces:**

- Consumes: Task 4 的通知請求
- Produces:
  - `POST /internal/notify/workout-finished`
    - 驗證 `Authorization: Bearer <Google ID token>`：用 `google.oauth2.id_token.verify_oauth2_token(token, Request(), audience=BOT_AUDIENCE)`，且 `email == API_SA_EMAIL`、`email_verified` 為 true；不符合回 401，不讀 body
    - body：`{ lineUserId, summary, templateName }`；`lineUserId` 必須符合 `^U[0-9a-f]{32}$`，否則回 400
    - 呼叫 `LineReplier.push(line_user_id, [workout_done(...)])`；成功回 204，LINE 回錯誤（例如額度用完）回 502
    - 不記錄 id、token 或內容，只記錄狀態碼
  - `Settings` 新增 `BOT_AUDIENCE`、`API_SA_EMAIL`（與其他設定一樣延遲載入，`/health` 不需要）
  - `LineReplier.push(user_id, messages)`：用 `MessagingApi.push_message`
  - `messages.workout_done(summary, template_name, liff_id)`：
    - 標題「今天辛苦了！」
    - 內文：動作數、組數、總訓練量；有有氧時加「有氧 {m} 分鐘」
    - 每個 PR 一行，例如「新紀錄：槓鈴深蹲 估算 1RM 116.7 kg（100 kg × 5）」，用 accent-soft 色塊標示
    - 按鈕「看今天的總覽」：postback `action=today`
    - `altText`：「訓練完成」

- [ ] **Step 1: 寫失敗的測試**：
  - `test_notify_without_token_is_401_and_does_not_push`
  - `test_notify_with_wrong_service_account_is_401`
  - `test_notify_pushes_workout_done_flex`
  - `test_notify_push_failure_returns_502`
  - `test_notify_rejects_bad_line_user_id`
  - `test_workout_done_flex_is_valid_for_sdk`（用 `_to_sdk` 驗證，含 PR 與只有有氧兩種情況）
- [ ] **Step 2: 執行測試**。Expected：FAIL。
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 執行** `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`。Expected：PASS。
- [ ] **Step 5: Commit** `feat(bot): push workout finished notifications`

### Task 6: LIFF 訓練畫面

**Files:**

- Create: `apps/liff/src/pages/workout/WorkoutHome.tsx`、`ActiveWorkout.tsx`、`ExercisePicker.tsx`、`FinishSummary.tsx`（各有測試）
- Modify: `apps/liff/src/App.tsx`（`/workout`）、`apps/liff/src/pages/Records.tsx`（訓練卡片）

**Interfaces（依 §10.1 設計稿 Liff-Workout）：**

- **WorkoutHome**（沒有進行中的訓練時）：
  - 標題「記訓練」
  - 「本週訓練 N 次」、各肌群組數的橫條（只列 > 0 的肌群），以及「有氧 {m} 分鐘」
  - 範本列表，每個有「開始」與「刪除」（刪除前要確認）
  - 主要按鈕「空白開始」
  - 有進行中的訓練時，直接顯示 ActiveWorkout
- **ActiveWorkout**：
  - 頂部：「{範本名稱或「訓練進行中」}」與經過時間 mm:ss
  - 每個動作一張卡：
    - 中文名稱用 serif 字體，英文名稱以小字顯示在下方
    - 有氧動作的卡片改為輸入：時間（分鐘，必填）、距離、坡度、速度、等級（選填）；「完成這筆」送出 `PUT /cardio`
    - 有上次紀錄時顯示「上次（M/D）：80 kg × 8、8、8」
    - 有建議時顯示 accent-soft 框：「上次每組都做到了，今天試試 82.5 kg？」
    - 組列表：組號、重量、次數、RPE（選填）
    - 已完成的組顯示 ✓ 並可修改；新的一組預填上一組的值
    - 「完成這組」送出 `PUT`；「＋ 加一組」
  - 底部：「＋ 加動作」開啟 ExercisePicker；「結束訓練」需確認後才送出 finish
- **ExercisePicker**：
  - 搜尋框（中英文皆可）
  - 第一列 chip：重訓／有氧；重訓時第二列 chip 依肌群篩選，第三列依器材類別（機械式、半機械式、自由重量、徒手）篩選
  - 每個動作顯示中文、英文與器材標籤
  - 點選即加入訓練
  - 「新增自訂動作」：中文名稱、英文名稱（選填）、種類、肌群（重訓才要）、器材
- **FinishSummary**：
  - 總訓練量、動作數、組數
  - 有 PR 時用 accent-soft 卡逐一列出
  - 「存成範本」：輸入名稱 →「已存成範本」
  - `notified` 為 true 時顯示「已傳到聊天室」；false 時不顯示錯誤，只顯示畫面上的摘要
  - 按鈕「回到聊天室」（`closeWindow`）
- **Records 頁**：訓練卡片改為可用。顯示「本週訓練 N 次」，連到 `/workout`。

- [ ] **Step 1: 寫失敗的測試**（fetch 與 liff 都用假的）：
  - `home shows week stats and templates; blank start calls POST /workouts`
  - `resume active session on open`
  - `last sets and hint are shown; first-time exercise shows none`
  - `complete set sends PUT with prefilled values`
  - `invalid reps shows field error`
  - `picker filters by kind, muscle and equipment category; English search; adds exercise; custom exercise form`
  - `cardio card records duration and optional fields`
  - `finish requires confirm and shows PRs`
  - `finish shows 已傳到聊天室 only when notified`
  - `save as template`
  - `records training card links to /workout`
- [ ] **Step 2: 執行** `npm test -w @gac/liff`。Expected：FAIL。
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 執行** `npm test -w @gac/liff && npm run build -w @gac/liff && npm run typecheck`，以及 lint。Expected：PASS。
- [ ] **Step 5: Commit** `feat(liff): record workouts`

### Task 7: 基礎設施（api 與 bot 互相呼叫）

**Files:**

- Modify: `infra/run.tf`、`infra/tests/core.tftest.hcl`

**Interfaces:**

- `local.bot_url = "https://bot-${data.google_project.this.number}.${var.region}.run.app"`（和 `api_url` 相同的固定網址格式）
- api 新增 env：`BOT_URL = local.bot_url`、`BOT_AUDIENCE = "gac-bot-internal"`
- bot 新增 env：`BOT_AUDIENCE = "gac-bot-internal"`、`API_SA_EMAIL = api-runtime 服務帳號的 email`
- 不需要新的 IAM：bot 是公開服務，驗證在程式內進行（與 api 的內部端點相同）

- [ ] **Step 1: 寫失敗的 terraform test**：api 有 `BOT_URL`（以 `https://bot-` 開頭）與 `BOT_AUDIENCE`；bot 有 `API_SA_EMAIL` 與 `BOT_AUDIENCE`
- [ ] **Step 2: 執行** `terraform test`（scratch `TF_DATA_DIR`、`init -backend=false`）。Expected：FAIL。
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 執行** `terraform fmt -check -recursive && terraform validate && terraform test`。Expected：PASS。
- [ ] **Step 5: Commit** `feat(infra): wire api to bot notifications`

### Task 8: 上線（營運步驟，每一步對外動作都先經使用者確認）

- [ ] **Step 1: 合併前先 `terraform apply`。** 新版 api 啟動時需要 `BOT_URL`、`BOT_AUDIENCE`，所以必須先套用；舊版程式會忽略多出來的環境變數。先 plan 給使用者看，同意後才 apply。
- [ ] **Step 2: 開 PR、等 CI 綠燈。** 經使用者同意後合併；部署會跑 migration 0003 與 0004。
- [ ] **Step 3: 部署後從外部確認。** `OPTIONS /templates/x` 的 DELETE 預檢通過；`/workout` 頁回 200。
- [ ] **Step 4: 手機驗收：**
  1. 空白開始，加兩個動作，各記兩組，結束
  2. 聊天室收到 push 的「今天辛苦了！」
  3. 存成範本
  4. 再用範本開始一次，看到「上次」與建議；加重後結束，收到 PR 恭喜
  5. 今日總覽顯示訓練摘要
- [ ] **Step 5: 檢查 log。** 不能有 token 或 userId。
