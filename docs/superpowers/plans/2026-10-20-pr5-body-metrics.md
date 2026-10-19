# PR 5: Body Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在聊天室輸入「體重 72.5」能記錄並回覆與上次的差異，LIFF 能看到體重、體脂、腰圍的 7／30／90 天趨勢圖（spec §10 PR 5 完成條件：能記錄體重並看到圖）。

**Architecture:**

- `bot` 解析聊天室的「體重／體脂／腰圍 數字」指令，呼叫 `api` 的內部端點記錄，再回覆差異。
- `api` 沿用 PR 4 的 `body_metrics` 表（每人每天一筆），新增記錄與查詢 API。
- 7 日移動平均是純函式，放在 `packages/shared`。
- LIFF 用手寫 SVG 畫趨勢圖，不加圖表套件，並新增「我的紀錄」首頁與「身體數據」頁。

**Tech Stack:** 沿用現有技術，沒有新增套件，也沒有資料庫 migration 或基礎設施變更。

**Spec:** [docs/specs/2026-10-15-gym-assistant-coach-design.md](../../specs/2026-10-15-gym-assistant-coach-design.md) §5（`body_metrics`）、§6.3、§10 PR 5、§10.1 核准設計稿（LIFF「我的紀錄」、「身體數據」）。

## Global Constraints

- 沿用前幾個 PR 的所有限制：
  - `api` 是唯一的資料庫存取者
  - bot→api 用 Google ID token；LIFF→api 用 session，在 `onRequest` 驗證
  - CORS 只允許 LIFF 網域；目前允許 GET、HEAD、POST、PUT，PR 5 不新增其他方法
  - 錯誤只回 `ApiError`
  - 「哪一天」一律用 Asia/Taipei，用 `taipeiDate`
  - 繁體中文；按鈕高度 ≥ 44px；畫面只用設計 token
  - 不記錄 id、token 或內容
- 三種指標與合理範圍（集中定義在 shared 的 `METRIC_LIMITS`）：

  | 指標 | key | 範圍 | 小數 | 單位 |
  |---|---|---|---|---|
  | 體重 | `weightKg` | 30–300 | 一位 | kg |
  | 體脂 | `bodyFatPct` | 3–60 | 一位 | % |
  | 腰圍 | `waistCm` | 40–200 | 一位 | cm |

  輸入超過一位小數時，四捨五入到一位，和資料庫的 `numeric(5,1)` 一致。
- 每人每天一筆：同一天再記一次會覆蓋當天那個欄位，其他欄位不動。
- **記錄體重不會自動重算每日目標**：目標只在個人檔案重新儲存時重算，避免每天的波動讓目標跟著跳。
- 7 日移動平均的定義：對每個有值的日期 d，取日期在 [d−6, d] 內所有有值點的平均。

## Review Focus

1. **全形數字與空白**：例如「體重　７２．５」「體重:72.5kg」都要能辨識；用 Unicode NFKC 正規化後再解析。由 Task 3 測試涵蓋。
2. **第一筆紀錄**：沒有「上次」可比較時，回覆不顯示差異，也不能出錯。由 Task 2、Task 3 測試涵蓋。
3. **同一天記兩次**：第二次覆蓋當天的值。「上次」要找今天以前最新的一筆，不能拿今天剛記的那筆來比。由 Task 2 測試涵蓋。
4. **期間內只有一筆，或完全沒有資料**：圖表不能壞掉。一筆時只畫一個點；沒有資料時顯示空狀態文字。由 Task 4 測試涵蓋。
5. **超出範圍或格式錯誤**：例如「體重 7250」。回覆範圍提示，不寫入資料庫。不像指令的一般文字，照舊回覆原本的訊息。由 Task 3 測試涵蓋。

---

## File Structure

| 路徑 | 職責 |
|---|---|
| `packages/shared/src/metrics.ts` | `MetricKey`、`METRIC_LIMITS`、`trailingAverage`、`addDays`，以及 API 型別 |
| `apps/api/src/metrics/repo.ts` | 記錄指標、查上次、查期間資料 |
| `apps/api/src/metrics/routes.ts` | LIFF 用的 `GET /body-metrics`、`PUT /body-metrics/today` |
| `apps/api/src/internal/routes.ts`（修改） | bot 用的 `POST /internal/body-metrics` |
| `apps/bot/app/commands.py` | 解析「體重 72.5」等指令 |
| `apps/bot/app/handlers.py`、`messages.py`、`api_client.py`（修改） | 文字訊息指令與回覆 |
| `apps/liff/src/router.ts`（修改）、`pages/Records.tsx`、`pages/BodyMetrics.tsx`、`components/TrendChart.tsx` | 我的紀錄首頁、身體數據頁、趨勢圖 |

---

### Task 1: 指標常數與移動平均（shared）

**Files:**

- Create: `packages/shared/src/metrics.ts`、`packages/shared/src/metrics.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**

- Produces:
  - `type MetricKey = "weightKg" | "bodyFatPct" | "waistCm"`
  - `METRIC_LIMITS: Record<MetricKey, { min: number; max: number; label: string; unit: string }>`
    - label：體重、體脂、腰圍
    - unit：kg、%、cm
  - `roundMetric(v: number): number`：四捨五入到一位小數
  - `isValidMetric(key, v): boolean`：`v` 必須是有限數字，且四捨五入後落在範圍內
  - `addDays(date: string, n: number): string`：以 `YYYY-MM-DD` 做日期加減，用 UTC 計算，不受時區影響
  - `trailingAverage(points: { date: string; value: number }[], windowDays = 7): { date: string; value: number }[]`：輸入依日期遞增，輸出同樣的日期，值為移動平均並 `roundMetric`
  - `interface BodyMetricPoint { date: string; weightKg: number | null; bodyFatPct: number | null; waistCm: number | null }`
  - `interface BodyMetricsResponse { from: string; to: string; points: BodyMetricPoint[] }`：只包含有資料的日期，依日期遞增
  - `interface MetricRecordedResponse { key: MetricKey; value: number; date: string; previous: { value: number; date: string } | null }`

- [ ] **Step 1: 寫失敗的測試**：
  - `roundMetric rounds to one decimal`：72.45 → 72.5、72.44 → 72.4
  - `isValidMetric boundaries`：
    - 體重 30 與 300 合法，29.9 與 300.1 不合法
    - NaN 不合法
    - 體脂 3 合法、2.9 不合法
  - `addDays crosses month and year`：
    - `2026-10-31` + 1 → `2026-11-01`
    - `2027-01-01` − 1 → `2026-12-31`
  - `trailingAverage uses calendar window`：
    - 輸入：10/01 = 70、10/05 = 72、10/08 = 74
    - 期望：10/01 → 70、10/05 → 71、10/08 → 73（10/01 已在 7 天窗外）
  - `trailingAverage of single point is itself`
  - `trailingAverage of empty is empty`
- [ ] **Step 2: 執行** `npm test -w @gac/shared`。Expected：FAIL。
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 執行** `npm test -w @gac/shared && npm run typecheck && npm run lint`。Expected：PASS。
- [ ] **Step 5: Commit** `feat(shared): add body metric limits and trailing average`

### Task 2: 身體數據 API（api）

**Files:**

- Create: `apps/api/src/metrics/repo.ts`、`apps/api/src/metrics/routes.ts`
- Modify: `apps/api/src/internal/routes.ts`、`apps/api/src/app.ts`
- Test: `apps/api/test/metrics.test.ts`

**Interfaces:**

- Consumes: Task 1；PR 4 的 `body_metrics` 表（`unique(user_id, measured_on)`）、`bearerAuth`、`verifySession`、`findByLineUserId`、`deps.now`
- Produces（repo）：
  - `recordMetric(db, userId, date, key: MetricKey, value): Promise<void>`：upsert 當天那個欄位，不動其他欄位
  - `previousMetric(db, userId, key, beforeDate): Promise<{ value: number; date: string } | null>`：找 `measured_on < beforeDate` 且該欄位不為 null 的最新一筆
  - `listMetrics(db, userId, from, to): Promise<BodyMetricPoint[]>`：包含頭尾兩天，依日期遞增，numeric 轉成 number
- Produces（routes）：
  - `POST /internal/body-metrics`：bot 用，驗證服務 token
    - body：`{ lineUserId, key: MetricKey, value: number }`
    - 先 `syncUser` 確保使用者存在；`value` 不合法時回 400
    - 回 `MetricRecordedResponse`，`date` 為 `taipeiDate(now)`，`previous` 用 `previousMetric(..., today)`
  - `GET /body-metrics?days=7|30|90`：LIFF session
    - `days` 只接受 7、30、90，其他值回 400
    - `to` 為今天，`from` = `addDays(to, −(days − 1))`
    - 回 `BodyMetricsResponse`
  - `PUT /body-metrics/today`：LIFF session
    - body：`{ weightKg?, bodyFatPct?, waistCm? }`，至少一個欄位；每個值都要通過 `isValidMetric`，否則回 400
    - 只寫入有提供的欄位
    - 回 `BodyMetricsResponse`（預設 30 天）

- [ ] **Step 1: 寫失敗的測試**（記得關閉 `createTestDb`）：
  - `recordMetric only touches its column`：同一天先記體重、再記腰圍，兩個欄位都要存在
  - `same day twice overwrites`
  - `previousMetric ignores today and null columns`
  - `internal record returns previous from an earlier day`：值為 72.5，上次是 72.9（10/14）
  - `internal record first time has null previous`
  - `internal record rejects out-of-range value with 400`
  - `GET /body-metrics rejects days=10`
  - `GET /body-metrics returns window in Taipei dates`：`now` 為 `2026-10-19T16:30:00Z`，days 7 → `from` 是 `2026-10-14`、`to` 是 `2026-10-20`
  - `PUT /body-metrics/today writes only given fields`
  - `metrics routes need a session (401)`
  - `metrics are isolated per user`
- [ ] **Step 2: 執行** `npm test -w @gac/api`。Expected：FAIL。
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 執行** `npm test && npm run typecheck && npm run lint`。Expected：PASS。
- [ ] **Step 5: Commit** `feat(api): record and query body metrics`

### Task 3: 聊天室指令（bot）

**Files:**

- Create: `apps/bot/app/commands.py`、`apps/bot/tests/test_commands.py`
- Modify: `apps/bot/app/handlers.py`、`messages.py`、`api_client.py`
- Test: `apps/bot/tests/test_webhook.py`（新增案例）

**Interfaces:**

- Consumes: Task 2 的 `POST /internal/body-metrics`、`MetricRecordedResponse`（camelCase）
- Produces:
  - `parse_metric_command(text: str) -> MetricCommand | None`：`MetricCommand(key, value)` 或 `InvalidMetric(key)`
    - 先做 NFKC 正規化，去掉頭尾空白
    - 格式：`^(體重|體脂|腰圍)\s*[:：]?\s*(\d{1,3}(?:\.\d+)?)\s*(kg|公斤|%|cm|公分)?$`
    - 指令詞對應的 key：體重 → `weightKg`、體脂 → `bodyFatPct`、腰圍 → `waistCm`
    - 數字超出範圍（範圍值和 shared 相同，在 Python 端複製一份常數）時回 `InvalidMetric`
    - 不符合格式時回 None
  - `ApiClient.record_metric(line_user_id, key, value) -> MetricRecorded`
  - 文字訊息處理（已同意的使用者）：
    - 是指令：記錄後回覆
    - 不是指令：照舊回 `placeholder_reply`
    - 未同意的使用者一律回歡迎卡片
- 回覆文案（`messages.py`），單位：體重 kg、體脂 %、腰圍 cm：
  - 第一次：「已記錄體重 72.5 kg。」
  - 有上次紀錄：「已記錄體重 72.5 kg，比上次（10/14）少 0.4 kg。」
    - 「多」或「少」依差值正負；差值四捨五入到一位
    - 沒有變化時寫「和上次（10/14）一樣」
  - 範圍錯誤：「體重的數字好像不太對，請輸入 30–300 之間的數字，例如「體重 72.5」。」（體脂、腰圍各用自己的範圍與範例）
  - 每則回覆附一個 quick reply「看趨勢」，連到 `https://liff.line.me/{LIFF_ID}/records/body`

- [ ] **Step 1: 寫失敗的測試**：
  - `test_commands.py`：
    - `體重 72.5` → weightKg 72.5
    - `體重　７２．５` 全形 → 72.5
    - `體重:72.5kg` → 72.5
    - `腰圍 81 公分` → waistCm 81
    - `體脂18.6%` → bodyFatPct 18.6
    - `體重 7250` → InvalidMetric
    - `體重` 沒有數字 → None
    - `今天吃了雞腿便當` → None
  - `test_webhook.py`：
    - `test_weight_command_records_and_replies_diff`
    - `test_first_weight_has_no_diff`
    - `test_same_value_says_unchanged`
    - `test_invalid_weight_replies_range_and_does_not_call_api`
    - `test_non_command_text_keeps_placeholder`
    - `test_command_before_consent_replies_welcome`
    - `test_reply_has_trend_quick_reply`
- [ ] **Step 2: 執行** `cd apps/bot && uv run pytest -q`。Expected：FAIL。
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 執行** `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`。Expected：PASS。
- [ ] **Step 5: Commit** `feat(bot): record body metrics from chat commands`

### Task 4: LIFF 我的紀錄與身體數據

**Files:**

- Modify: `apps/liff/src/router.ts`（新增 `body` 路由：最後一段為 `body` 時）、`apps/liff/src/App.tsx`
- Create: `apps/liff/src/pages/Records.tsx`、`apps/liff/src/pages/BodyMetrics.tsx`、`apps/liff/src/components/TrendChart.tsx`
- Test: 對應的 `*.test.tsx`、`router.test.ts`（新增案例）

**Interfaces:**

- Consumes: Task 1 的 `trailingAverage`、`METRIC_LIMITS`、`isValidMetric`；Task 2 的端點；PR 4 的 `apiFetch`
- Produces:
  - `TrendChart({ points: { date; value }[], average: { date; value }[], label, unit })`
    - 手寫 SVG：每日紀錄畫成淡色點（`--color-border` 的深一階，用 token），移動平均畫成 `--color-primary` 的線
    - y 軸範圍：min/max 各留 10% 邊距；只有一個點時畫中線
    - 外層 `<svg role="img" aria-label="{label} {days} 天趨勢：從 X 到 Y {unit}">`
  - **Records 頁**（`/records`，依設計稿 Liff-Records，PR 5 只做身體數據）：
    - 標題「我的紀錄」
    - 「身體數據」卡片：最新體重，與 30 天內的變化，加上「看趨勢 ›」連到 `/records/body`
    - 「飲食」「訓練」卡片顯示「即將推出」，不可點
  - **BodyMetrics 頁**（`/records/body`，依設計稿 Liff-Trends）：
    - 標題「身體數據」，分段切換「7 天／30 天／90 天」，預設 30
    - 體重卡：最新值；期間內第一筆到最後一筆的變化，例如「30 天內 −1.2 kg」；趨勢圖；圖例「每日紀錄」「7 日平均」
    - 體脂、腰圍兩張小卡：最新值與變化。點擊後，主圖切換成該指標
    - 小提示「在聊天室輸入「體重 72.4」就能快速記錄。」
    - 按鈕「記錄今天的數據」：展開三個選填欄位，加上「儲存」
      - 送 `PUT /body-metrics/today`
      - 欄位錯誤時顯示範圍提示，例如「請輸入 30–300 之間的數字」
    - 空狀態：「還沒有紀錄。在聊天室輸入「體重 72.5」就能開始記錄。」

- [ ] **Step 1: 寫失敗的測試**：
  - `router.test.ts`：`/records/body` → `body`
  - `TrendChart.test.tsx`：
    - `single point renders one dot and no line error`
    - `aria-label summarizes first and last value`
  - `Records.test.tsx`：
    - `shows latest weight and links to body page`
    - `diet and training are coming soon`
  - `BodyMetrics.test.tsx`：
    - `default range is 30 days and calls GET days=30`
    - `switching to 7 calls days=7`
    - `empty state text`
    - `record today validates range and sends PUT with only filled fields`
    - `tapping body fat card switches chart label`
- [ ] **Step 2: 執行** `npm test -w @gac/liff`。Expected：FAIL。
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 執行** `npm test -w @gac/liff && npm run build -w @gac/liff && npm run typecheck && npm run lint`。Expected：PASS。
- [ ] **Step 5: Commit** `feat(liff): add records home and body metric trends`

### Task 5: 上線（營運步驟，每一步對外動作都先經使用者確認）

- [ ] **Step 1: 開 PR、等 CI 綠燈。** 經使用者同意後合併；這次沒有 migration 與基礎設施變更。
- [ ] **Step 2: 部署成功後，從外部確認：**
  - `/health` 正常
  - LIFF `/records/body` 回 200
  - `OPTIONS /body-metrics` 預檢允許 GET 與 PUT
- [ ] **Step 3: 手機驗收：**
  1. 傳「體重 72.5」→ 回覆「已記錄…」與「看趨勢」
  2. 再傳「體重 72.1」→ 回覆和上次的差異（同一天會覆蓋）
  3. 按「看趨勢」→ 看到圖
  4. 在 LIFF 記錄體脂、腰圍
  5. 從 Rich Menu「我的紀錄」→ 身體數據卡片 → 看趨勢
- [ ] **Step 4: 檢查 log。** 不能有 token、userId 或數值內容。
