# PR 6.1: Workout Polish, Speed, Rest Timer and Loading UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 PR 6 手機驗收時回報的 10 個問題，把「完成這組」與「加動作」從 4–5 秒降到 0.5 秒以內，新增組間休息的倒數計時與紀錄，並把 LIFF 的「載入中」改成骨架畫面。

**Architecture:**

- 速度：
  - 先加量測：每個請求記錄耗時、資料庫查詢次數與查詢總耗時，不記錄任何 id 或內容。
  - 再減少來回次數：驗證合併成 1 次查詢；回傳的訓練內容用固定 4 次查詢組出來，「上次紀錄」一次查完所有動作。
- 休息：LIFF 在「完成這組」後開始倒數。下一組完成時，把實際休息秒數一起送出，存在 `workout_sets.rest_sec`。
- 其餘為 LIFF 畫面調整。

**Tech Stack:** 沿用現有技術，不新增套件。新增 migration 0005（`workout_sets.rest_sec`）。

**Spec:** [docs/specs/2026-10-15-gym-assistant-coach-design.md](../../specs/2026-10-15-gym-assistant-coach-design.md) §6.4、§10.1；PR 6 計畫 [2026-10-20-pr6-workouts.md](2026-10-20-pr6-workouts.md)。

## 使用者回報（2026-10-21）與對應

| # | 問題 | 處理 |
|---|---|---|
| 1 | 加的動作要能刪除 | `DELETE /workouts/:id/items/:exerciseId`（連同該動作本次的組一起刪），卡片右上「移除」，需先確認 |
| 2 | RPE 看不懂 | 欄位標題「RPE 自覺強度」，輸入框下方提示「1 很輕鬆 – 10 力竭」 |
| 3 | 開始訓練按鈕太貼近我的範本 | 按鈕與範本區塊之間加 `--space-6` 間距 |
| 4 | 動作選單太貼近上方 | 搜尋框與分類 chip 列之間、各 chip 列之間加 `--space-3` 間距；清單上方加 `--space-4` |
| 5 | 動作名稱兩行時器材標籤變形 | 器材標籤固定高度、`white-space: nowrap`、`flex-shrink: 0`，靠右上對齊 |
| 6 | 完成這組、選動作要等好幾秒 | Task 1：先量測，再把來回次數降到 5 次以下 |
| 7 | 右上角時間意義不明 | 改成「訓練 32:15」；休息中時在下方顯示休息倒數 |
| 8 | 確定放棄與取消不在同一行 | 確認列改成同一行、兩個按鈕各占一半 |
| 9 | 「空白開始」改名 | 改為「開始訓練」 |
| 10 | 加動作後停在第一個動作 | 加完後自動捲動到新加入的動作卡片 |
| 新 1 | 組間休息 | 倒數並記錄（使用者已選擇）。詳見 Task 3 |
| 新 3 | 載入畫面 | Logo 與骨架畫面，取代純文字「載入中…」 |

新 2（動作插圖）另開 **PR 6.2**；新 4（拍照加動作）併入 **PR 8**（2026-10-21 使用者決定）。

## Global Constraints

- 沿用 PR 6 的所有限制：
  - `api` 是唯一的資料庫存取者
  - session 驗證在 `onRequest`，每個人只能存取自己的資料
  - 錯誤只回 `ApiError`
  - 「哪一天」一律用台北時區
  - 繁體中文；按鈕高度 ≥ 44px；畫面只用設計 token
  - 不記錄 id、token 或內容
  - CORS 已允許 GET、HEAD、POST、PUT、DELETE；這次不新增方法
- 速度目標：「完成這組」與「加動作」的 api 伺服器耗時中位數 **< 500 ms**，以 Cloud Run 的 request log 驗證。每次寫入最多 **5** 次資料庫來回，讀取目前訓練最多 **4** 次。
- 休息：
  - 預設 90 秒，可在 30–300 秒之間以 15 秒為單位調整
  - 設定存在 `localStorage`，用 key `gac.restSec`；讀寫都要包在 try/catch，失敗時用預設值
  - 倒數歸零時呼叫 `navigator.vibrate(200)`（支援才呼叫），並顯示「休息結束」
  - 實際休息秒數：從上一組完成到這一組按下「完成這組」的秒數，上限 3600；本次訓練的第一組為 null

## Review Focus

1. **刪除含已完成組的動作**：要一起刪除該動作在本次訓練的組，並更新本週統計；已結束的訓練不能刪。由 Task 2 測試涵蓋。
2. **休息途中關閉 LIFF 再開**：倒數依「上一組的完成時間」重新計算，不歸零；上一組超過 1 小時前時不顯示倒數。由 Task 3 測試涵蓋。
3. **`localStorage` 不能用**（無痕模式、被封鎖）：用預設值 90 秒，不能出錯。由 Task 3 測試涵蓋。
4. **量測本身不能拖慢請求或記錄敏感資料**：只記錄路由樣板（例如 `/workouts/:id/sets`），不記錄實際網址。由 Task 1 測試涵蓋。
5. **改用批次查詢後「上次紀錄」與 PR 規則不變**：既有的 repo 與 route 測試全部照常通過，不修改期望值。由 Task 1 涵蓋。

---

### Task 1: 量測與減少資料庫來回（api）

**Files:**

- Create: `apps/api/src/db/timing.ts`
- Modify: `apps/api/src/server.ts`、`apps/api/src/app.ts`、`apps/api/src/workouts/repo.ts`、`apps/api/src/workouts/session-routes.ts`
- Test: `apps/api/test/timing.test.ts`、`apps/api/test/workouts-repo.test.ts`（新增案例）

**Interfaces:**

- `instrument(sql)`：包裝 postgres.js，統計每個請求的查詢次數與耗時，用 `AsyncLocalStorage` 區分請求。
- Fastify `onResponse` 記錄一行：`{ msg: "request timing", route: req.routeOptions.url, method, status, ms, dbQueries, dbMs }`
  - `route` 是樣板（`/workouts/:id/sets`），不是實際網址
  - 不記錄 id、body 或使用者資訊
  - 測試環境（pglite）可以不量測，但 log 欄位格式要有測試
- 減少來回次數：
  - `requireKind` 改成一次查詢，同時取得「這個使用者的進行中訓練」與「可見的動作」；任一不存在時，丟出與原本相同的錯誤
  - `ensureItem` 改成單一 `insert … select coalesce(max(position)+1, 0) … on conflict do nothing`
  - `buildSession` 固定 4 次查詢：
    1. 訓練與範本名稱，用 left join
    2. 動作清單與動作資料
    3. 這次的組與有氧紀錄，用 `union all`，或兩個查詢以 `Promise.all` 平行
    4. **一次**查出所有重訓動作的「上次紀錄」：用 `distinct on (exercise_id)` 找每個動作最近一次其他已完成訓練，再取出那些訓練的組；可拆成兩個平行查詢
  - 寫入路由不再重新查 `findActive`，直接用已知的 session 組出回應
- 驗收：
  - repo 加一個「計數測試」：在 pglite 用計數 wrapper，斷言 `upsertSet` 加回傳共 ≤ 5 次查詢、`getActiveSession` ≤ 4 次（Promise.all 平行的查詢分別計次，但不得依動作數量增加）
  - 部署後由 Task 5 用 Cloud Run log 驗證 < 500 ms

- [ ] **Step 1: 寫失敗的測試**：
  - `timing log has route template, counts and no ids`
  - `upsertSet plus response uses at most 5 queries`
  - `getActiveSession query count does not grow with item count`：1 個與 5 個動作時查詢數相同
- [ ] **Step 2: 執行** `npm test -w @gac/api`。Expected：FAIL。
- [ ] **Step 3: 實作。** 既有的 workouts repo 與 route 測試全部要通過，且不修改期望值。
- [ ] **Step 4: 執行** `npm test && npm run typecheck && npm run build -w @gac/api`，以及 lint。Expected：PASS。
- [ ] **Step 5: Commit** `perf(api): instrument requests and cut workout round trips`

### Task 2: 移除動作與休息秒數（api）

**Files:**

- Modify: `apps/api/src/db/schema.ts`；Create: `db/migrations/0005_rest_sec.sql`（drizzle-kit 產生）
- Modify: `apps/api/src/workouts/repo.ts`、`session-routes.ts`、`packages/shared/src/workouts.ts`
- Test: `apps/api/test/session-routes.test.ts`、`workouts-repo.test.ts`

**Interfaces:**

- `workout_sets.rest_sec int`，可為 null，check `rest_sec between 0 and 3600`
- `WorkoutSet` 新增 `restSec?: number`、`completedAt: string`（ISO 格式；Task 3 依此計算倒數）
- `PUT /workouts/:id/sets` 的 body 新增 `restSec?`（0–3600 的整數）
- `DELETE /workouts/:id/items/:exerciseId` → `ActiveSession`
  - 在同一個交易內，刪除該動作本次的 item、組與有氧紀錄
  - 已結束或不是自己的訓練回 404；動作不在本次訓練中回 404
- `FinishSummary` 新增 `avgRestSec: number | null`：本次有 `rest_sec` 的組的平均，四捨五入成整數

- [ ] **Step 1: 寫失敗的測試**：
  - `delete item removes its sets and returns session`
  - `delete item on finished or foreign session is 404`
  - `restSec stored and returned; out of range is 400`
  - `finish reports avgRestSec`
  - `completedAt returned for sets`
- [ ] **Step 2–4:** 實作、跑測試、跑 lint。Expected：PASS。
- [ ] **Step 5: Commit** `feat(api): remove session items and record rest time`

### Task 3: LIFF 訓練畫面修正與休息計時

**Files:**

- Modify: `apps/liff/src/pages/workout/WorkoutHome.tsx`、`ActiveWorkout.tsx`、`ExercisePicker.tsx`、`FinishSummary.tsx`、`apps/liff/src/theme.ts`，以及對應的測試
- Create: `apps/liff/src/pages/workout/RestTimer.tsx`、`restSettings.ts`（各有測試）

**Interfaces（對應上方表格 1–10 與新 1）：**

- **WorkoutHome**：按鈕改成「開始訓練」，與範本區塊之間有 `--space-6` 間距（#3、#9）。
- **ActiveWorkout**：
  - 頂部改成「訓練 mm:ss」（#7）
  - 每張動作卡右上有文字按鈕「移除」→ 確認列「移除這個動作和本次的紀錄？」，加上「確定移除」「取消」，兩個按鈕在**同一行**（#1）
  - 「放棄這次訓練」的確認列也改成同一行（#8）
  - 重訓表格的欄位標題「RPE 自覺強度」，輸入框下方 muted 小字「1 很輕鬆 – 10 力竭」（#2）
  - 加完動作後，用 `scrollIntoView({ behavior: "smooth", block: "start" })` 捲到新卡片（#10）
- **RestTimer**（新 1）：
  - 「完成這組」成功後，在頂部固定區顯示「休息 1:30」倒數，附「−15 秒」「+15 秒」「跳過」三個按鈕
  - 倒數歸零時顯示「休息結束」並震動；之後改為顯示超時「已休息 2:10」
  - 起點是本次最後一組的 `completedAt`，所以重開 LIFF 也能接續；超過 1 小時不顯示
  - 下一組送出時帶 `restSec = round((now − 上一組 completedAt) / 1000)`，上限 3600；第一組不送
  - 「−15／+15」調整預設休息秒數並存入 `localStorage`（30–300 秒）
- **restSettings.ts**：`getRestSec(): number`、`setRestSec(n): void`，兩者都包在 try/catch 裡。
- **ExercisePicker**：
  - 搜尋框、chip 列、清單之間加間距（#4）
  - 每列器材標籤固定形狀：`height: 28px; white-space: nowrap; flex-shrink: 0; align-self: flex-start`，名稱區 `min-width: 0` 可換行（#5）
- **FinishSummary**：有 `avgRestSec` 時顯示「平均休息 1:35」。

- [ ] **Step 1: 寫失敗的測試**：
  - `home button reads 開始訓練`
  - `remove exercise needs confirm and sends DELETE; buttons on one row`
  - `discard confirm buttons on one row`
  - `RPE header has Chinese label and hint`
  - `elapsed label reads 訓練`
  - `adding an exercise scrolls to its card`（mock `scrollIntoView`）
  - `rest countdown starts after completing a set and resumes from last completedAt`
  - `next set sends restSec; first set does not`
  - `rest adjust persists; storage failure falls back to 90`
  - `rest end vibrates when supported`（fake timers，mock `navigator.vibrate`）
  - `finish shows average rest`
- [ ] **Step 2–4:** 實作、跑測試、build、typecheck、lint。Expected：PASS。
- [ ] **Step 5: Commit** `feat(liff): polish workout screens and add rest timer`

### Task 4: LIFF 載入畫面

**Files:**

- Create: `apps/liff/src/components/Splash.tsx`、`Skeleton.tsx`（各有測試）
- Modify: `apps/liff/src/App.tsx`、`apps/liff/index.html`、各頁面的載入狀態

**Interfaces:**

- **Splash**（登入中）：
  - 置中顯示 Logo「對話教練」SVG（與聊天室頭像同一個），下方是 serif 字體的「Gym Assistant Coach」與 muted 小字「正在準備你的資料…」
  - Logo 有輕微的呼吸動畫；`prefers-reduced-motion` 時不動畫
- **`index.html`**：在 `<div id="root">` 內放同樣的靜態 Splash HTML（inline style，只用 token 色碼），讓 JS 下載前就有畫面；React 掛載後取代。
- **Skeleton**：各頁面資料載入中顯示與版面相符的灰色區塊（surface-alt 色、圓角、微光動畫，同樣尊重 reduced-motion），取代「載入中…」文字。
  - 個人檔案：表單外框
  - 我的紀錄、身體數據：卡片與圖表區
  - 記訓練：範本卡片
  - 訓練中：動作卡片
- 骨架只有 `aria-hidden`；外層加 `role="status"` 與 `aria-label="載入中"`，讓螢幕閱讀器仍知道正在載入。

- [ ] **Step 1: 寫失敗的測試**：
  - `splash shows logo and app name while logging in`
  - `each page shows skeleton with status role while loading`
  - `index.html has static splash inside root`
- [ ] **Step 2–4:** 實作、跑測試、build、lint。Expected：PASS。
- [ ] **Step 5: Commit** `feat(liff): branded splash and skeleton loading`

### Task 5: 上線（營運步驟，每一步對外動作都先經使用者確認）

- [ ] **Step 1: 開 PR、等 CI 綠燈。** 經使用者同意後合併；部署會跑 migration 0005。這次沒有基礎設施變更。
- [ ] **Step 2: 手機驗收。** 依上方表格逐項確認，包含休息倒數與載入畫面。
- [ ] **Step 3: 從 Cloud Run log 驗證速度。** 讀 `request timing` 這一行：`/workouts/:id/sets` 與 `/workouts/:id/items` 的 `ms` 中位數 < 500，`dbQueries` ≤ 5。
  - 若仍偏慢，依 `dbMs` 佔比判斷瓶頸在資料庫或冷啟動，再向使用者提出下一步（例如 min instances 1 的費用評估）。
