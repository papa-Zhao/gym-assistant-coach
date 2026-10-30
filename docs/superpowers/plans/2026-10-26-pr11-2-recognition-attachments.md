# PR 11.2: 動作辨識準確度與滑輪把手 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 拍器材照片時推薦的動作更準；滑輪動作可以記錄用了哪種把手，「上次」、加重建議和個人最佳只跟同一種把手比。

**Architecture:**
- 辨識：動作庫補上台灣健身房常見、目前沒有的機械動作（每個都有自己的圖）；prompt 加上挑動作的規則；伺服器端把和辨識出的器材不相容的候選動作過濾掉；照片辨識的模型改成可以單獨設定，用評測決定要不要從 Haiku 換成 Sonnet。
- 把手：`workout_session_items` 和 `workout_template_items` 各加一個可為 null 的 `attachment` 欄位。只有器材是 `cable` 的動作可以設定。上次紀錄、加重建議、個人最佳都改成依「動作＋把手」比較。AI 辨識也會猜把手，選候選動作時一起帶進去。

**Tech Stack:** 現有套件；migration 用 drizzle-kit（`db/migrations`）。

**Spec:** 2026-10-26 手機測試回饋第 1、2 項（本計畫「已決定」一節）；規格 [docs/specs/2026-10-15-gym-assistant-coach-design.md](../../specs/2026-10-15-gym-assistant-coach-design.md) 訓練紀錄、器材辨識章節；PR 8.2 計畫（器材照片）。

**前一份計畫：** PR 11.4 訓練建議（2026-10-30 調整順序：11.3 → 11.4 → 11.2）。要等 11.3、11.4 都合併後才實作：11.3 改過 `EquipmentPhoto.tsx`、`ExercisePicker.tsx`（照片建立自訂動作），11.4 加了 `workoutAdviceContext`，本 PR 要在它們之上加把手。

## 已決定（2026-10-26，使用者同意）

1. 辨識的問題是「器材種類對、推薦的動作錯」。
2. 「把手」指滑輪的把手配件。

## 規劃時的決定（我替你做的）

1. **把手清單（7 種）**：`rope` 繩索、`straight_bar` 直槓、`ez_bar` 曲槓把、`v_handle` V 型把、`single_handle` 單手把、`lat_bar` 下拉長槓、`ankle_strap` 腳踝綁帶。可以不選（null，顯示「未指定」）。
2. **把手存在「這次訓練的這個動作」上**（session item），不是每一組各存一次。實際上同一個動作中途換把手很少見；要換時改選單即可，整個動作一起改。
3. **比較規則**：null 只和 null 比，`rope` 只和 `rope` 比（SQL 用 `is not distinct from`）。所以加這個功能之前的舊紀錄（全部是 null）只會出現在「未指定」時的「上次」。
4. **範本會記住把手**：從訓練存成範本時複製，從範本開始訓練時帶回 session item。
5. **動作庫新增 17 個動作**（migration seed，`on conflict (slug) do nothing`），清單見 Task 2。每個都畫自己的圖（`poses.ts`），不借用肌群的圖，避免 PR 11.3 要解決的「圖不對」問題又出現在內建動作上。實作前請使用者看一次清單，可以增刪。
6. **候選過濾**：候選動作的器材要和 AI 判斷的器材相容才保留。相容的定義：完全相同；或兩者都在「機械組」`selectorized_machine`、`plate_loaded_machine`、`cable` 之內（台灣很多插銷式下拉機在資料裡是 `cable`）。自由重量與自體重量必須完全相同。
7. **模型**：新增常數 `EQUIPMENT_PHOTO_MODEL`（預設仍是 `AI_MODEL`，也就是 Haiku）。用使用者提供的測試照片跑評測：Sonnet 的第一名命中率比 Haiku 高 15 個百分點以上才換。成本差異寫進交接備註。
8. 這次**不做**「記錄使用者改選了哪個動作」的資料收集（之後真的需要再說）。

## Global Constraints

- 使用者看得到的文字一律是繁體中文；把手標籤原樣使用上面第 1 點。
- 把手只能設定在 `exercise.equipment === "cable"` 的動作上；其他動作送 `attachment` 回 400 `bad_request`。
- AI 回傳的 `attachment` 不在清單內、或器材不是 `cable` 時，一律當作 null。
- 候選最多 5 個（沿用 `MAX_CANDIDATES`）。
- prompt 不能放日期或使用者資料（保持 prompt cache 有效）。
- migration 編號接在 PR 11.4 的 `0014` 之後（本 PR 為 `0015`）。實作前用 `ls db/migrations` 確認最後一號。
- 不要 stage `.claude/` 和 `skills-lock.json`。

## Review Focus

1. **舊訓練中途改把手**：改了之後「上次」和加重建議要立刻換成新把手的紀錄（API 回傳整個 session，LIFF 重新 render）。
2. **把手改成 null**：要能從「繩索」改回「未指定」。
3. **從舊範本（沒有 attachment 欄位值）開始訓練**：item 的 attachment 是 null，不能出錯。
4. **AI 判斷是滑輪、但候選動作裡有非滑輪的機械動作**：選了非滑輪動作時不能帶 attachment 進去（否則 400）。
5. **資料匯出**：匯出的 session item 和範本要包含 attachment。

---

### Task 1: 把手的共用型別與資料庫欄位

**Files:**
- Modify: `packages/shared/src/workouts.ts`、`packages/shared/src/workouts.test.ts`
- Modify: `apps/api/src/db/schema.ts`
- Create: `db/migrations/0015_cable_attachments_and_exercises.sql`（drizzle-kit 產生，Task 2 的 seed 加在同一個檔案後面）
- Modify: `apps/api/src/users/export.ts`、`apps/api/test/export.test.ts`

**Interfaces:**
- Produces（shared）:
  ```ts
  export const CABLE_ATTACHMENTS = ["rope","straight_bar","ez_bar","v_handle","single_handle","lat_bar","ankle_strap"] as const;
  export type CableAttachment = (typeof CABLE_ATTACHMENTS)[number];
  export const CABLE_ATTACHMENT_LABELS: Record<CableAttachment, string>;
  export function supportsAttachment(e: Pick<Exercise, "equipment">): boolean; // equipment === "cable"
  ```
  `SessionItemBase` 加 `attachment: CableAttachment | null`；`Template["items"][number]` 加 `attachment: CableAttachment | null`。
- DB：兩個表各加 `attachment text`，check `attachment is null or attachment in (...)`。

- [ ] **Step 1: 寫失敗的測試**：`supportsAttachment` 對 `cable` 為 true、`selectorized_machine` 為 false；`CABLE_ATTACHMENT_LABELS.rope === "繩索"`；export 測試斷言 session item 有 `attachment`。
- [ ] **Step 2: 跑測試確認失敗**：`npm test -w @gac/shared -w @gac/api -- workouts export`，Expected: FAIL
- [ ] **Step 3: 實作**：shared 型別、schema 欄位、`npx drizzle-kit generate`（照 `apps/api/drizzle.config.ts`），export 加欄位。
- [ ] **Step 4: 跑測試確認通過**：同上指令，Expected: PASS
- [ ] **Step 5: Commit**：`feat: cable attachment column and types`

### Task 2: 新增內建動作與圖

**Files:**
- Modify: `db/migrations/0015_cable_attachments_and_exercises.sql`（後面加 insert）
- Modify: `apps/liff/src/illustrations/poses.ts`
- Test: `apps/liff/src/illustrations/ExerciseIllustration.test.tsx`

**新增清單（slug｜中文｜英文｜肌群｜器材）：**

| slug | name_zh | name_en | muscle | equipment |
|---|---|---|---|---|
| seated-row-machine | 坐姿划船機 | Seated Row Machine | back | selectorized_machine |
| assisted-pull-up-machine | 輔助引體向上機 | Assisted Pull-up Machine | back | selectorized_machine |
| plate-loaded-lat-pulldown | 掛片式下拉機 | Plate-Loaded Lat Pulldown | back | plate_loaded_machine |
| straight-arm-pulldown | 滑輪直臂下拉 | Straight-Arm Pulldown | back | cable |
| back-extension | 羅馬椅背伸展 | Back Extension | back | bodyweight |
| incline-chest-press-machine | 上斜胸推機 | Incline Chest Press Machine | chest | plate_loaded_machine |
| smith-machine-bench-press | 史密斯機臥推 | Smith Machine Bench Press | chest | smith_machine |
| rear-delt-fly-machine | 反向飛鳥機 | Rear Delt Fly Machine | shoulders | selectorized_machine |
| lateral-raise-machine | 側平舉機 | Lateral Raise Machine | shoulders | selectorized_machine |
| cable-lateral-raise | 滑輪側平舉 | Cable Lateral Raise | shoulders | cable |
| biceps-curl-machine | 二頭彎舉機 | Biceps Curl Machine | biceps | selectorized_machine |
| triceps-extension-machine | 三頭伸展機 | Triceps Extension Machine | triceps | selectorized_machine |
| assisted-dip-machine | 輔助撐體機 | Assisted Dip Machine | triceps | selectorized_machine |
| cable-overhead-triceps-extension | 滑輪過頭三頭伸展 | Cable Overhead Triceps Extension | triceps | cable |
| hack-squat | 哈克深蹲機 | Hack Squat | quads | plate_loaded_machine |
| hip-abduction-machine | 髖外展機 | Hip Abduction Machine | glutes | selectorized_machine |
| glute-kickback-machine | 臀部後踢機 | Glute Kickback Machine | glutes | selectorized_machine |

（髖內收機沒有對應肌群，這次不加；之後若加「內收」肌群再補。）

- [ ] **Step 1: 寫失敗的測試**：`every seeded slug has its own pose`——用測試檔已經 import 的 `parseSeed` 讀所有 seed migration，斷言每個 slug 都在 `POSES`。
- [ ] **Step 2: 跑測試確認失敗**：`npm test -w @gac/liff -- ExerciseIllustration`，Expected: FAIL（17 個缺圖）
- [ ] **Step 3: 實作**：seed insert；在 `poses.ts` 照 PR 6.2 的畫法（116×112 畫布、4 邊界、器材線 2px、身體 7px）畫 17 個姿勢；用 `apps/liff/scripts/illustration-gallery.tsx` 產生圖庫，在瀏覽器窗格逐一目視檢查。
- [ ] **Step 4: 跑測試確認通過**（含既有的「不出畫布」測試）：同上，Expected: PASS
- [ ] **Step 5: Commit**：`feat: 17 more built-in machine exercises with poses`

### Task 3: 辨識——prompt、候選過濾、把手猜測、可設定模型

**Files:**
- Modify: `apps/api/src/ai/prompts.ts`（`EQUIPMENT_SYSTEM_HEAD`）
- Modify: `apps/api/src/ai/config.ts`（`EQUIPMENT_PHOTO_MODEL`）
- Modify: `apps/api/src/ai/structured-call.ts`（spec 可帶 `model`，預設 `AI_MODEL`）
- Modify: `apps/api/src/ai/equipment-identifier.ts`（schema 加 `attachment`，`EquipmentGuess.attachment: string`）
- Modify: `apps/api/src/workouts/identify.ts`（`shapeGuess` 過濾＋把手）
- Modify: `packages/shared/src/workouts.ts`（`IdentifyEquipmentResponse` 的 found 加 `attachment: CableAttachment | null`）
- Test: `apps/api/test/equipment-identifier.test.ts`、`apps/api/test/exercise-identify.test.ts`

**Interfaces:**
- Produces: `compatibleEquipment(a: Equipment, b: Equipment): boolean`（`identify.ts`，export 給測試用）。

**prompt 要加的規則（原樣加在「再從下方動作清單挑」那條之後）：**
```
- candidates 只能放「器材」欄和你判斷的 equipment 一樣的動作；插銷式、掛片式機械與滑輪可以互相替代，其他器材不行。
- 看座椅、靠墊、踏板、握把的位置和施力方向判斷是哪個動作，例如：坐姿往後拉是划船、往下拉是下拉；腳踩踏板往前推是腿推、肩膀頂著墊子往上是哈克深蹲。
- 不確定時寧可少給，不要拿不相關的動作湊數。
- 器材是滑輪時，attachment 填照片中掛著的把手（rope 繩索、straight_bar 直槓、ez_bar 曲槓把、v_handle V 型把、single_handle 單手把、lat_bar 下拉長槓、ankle_strap 腳踝綁帶）；看不到把手或不是滑輪時給 "none"。
```

- [ ] **Step 1: 寫失敗的測試**
  - `shapeGuess drops candidates with incompatible equipment`：guess 的 equipment 是 `dumbbell`，candidates 有 `dumbbell-curl` 和 `cable-curl`，結果只剩 `dumbbell-curl`。
  - `shapeGuess keeps machine-group substitutes`：equipment `selectorized_machine`，`lat-pulldown`（cable）保留。
  - `attachment kept only for cable`：equipment `cable`＋`rope` → `"rope"`；equipment `selectorized_machine`＋`rope` → null；`"none"` → null；未知字串 → null。
  - `equipment schema includes attachment enum`：`equipmentSchema(lib).properties.attachment.enum` 等於 `[...CABLE_ATTACHMENTS, "none"]`，且在 `required` 中。
  - `identifier uses EQUIPMENT_PHOTO_MODEL`：假 client 收到的 `model` 等於該常數。
- [ ] **Step 2: 跑測試確認失敗**：`npm test -w @gac/api -- equipment-identifier exercise-identify`，Expected: FAIL
- [ ] **Step 3: 實作**
- [ ] **Step 4: 跑測試確認通過**：同上，Expected: PASS
- [ ] **Step 5: Commit**：`feat(api): stricter equipment candidates and attachment guess`

### Task 4: 評測並決定模型（需要使用者的照片）

- [ ] **Step 1:** 請使用者準備資料夾：測試時認錯的器材照片 + `cases.json`（`expectSlugs` 填正確的 slug，可以用 Task 2 新增的 slug）。至少 15 張。
- [ ] **Step 2:** 用 Haiku 跑：`npm run eval:equipment-photo -w @gac/api -- <folder>`（金鑰用 `read -rs` 輸入）。記錄第一名命中率、前 5 名命中率、每張平均成本。
- [ ] **Step 3:** 暫時把 `EQUIPMENT_PHOTO_MODEL` 改成 `claude-sonnet-5-5` 再跑一次。
- [ ] **Step 4:** 依「規劃時的決定」第 7 點決定，把結果和決定寫進交接備註；更新 `docs/launch/cost-estimate.md` 的照片辨識成本（若換模型）。
- [ ] **Step 5: Commit**：`chore: equipment photo model decision`

### Task 5: 把手的 API（設定、上次、加重建議、個人最佳、範本）

**Files:**
- Modify: `apps/api/src/workouts/repo.ts`（`addItem`、新的 `setItemAttachment`、`sessionDataQuery`、`buildSession`、`finishSession` 的 PR 比較、`createTemplateFromSession`、`startSession`、`loadTemplates`）
- Modify: `apps/api/src/workouts/session-routes.ts`（`POST /workouts/:id/items` body 加可選的 `attachment`；新的 `PATCH /workouts/:id/items/:exerciseId`）
- Modify: PR 11.1 的 `listFinishedSessions`（items 加 `attachment`）
- Modify: PR 11.4 的 `workoutAdviceContext`（每個動作附上把手名稱；「上一次」改用「動作＋把手」）
- Test: `apps/api/test/workouts-repo.test.ts`、`apps/api/test/session-routes.test.ts`

**Interfaces:**
- Produces:
  - `addItem(db, userId, sessionId, exerciseId, attachment?: CableAttachment | null): Promise<ActiveSession>`
  - `setItemAttachment(db, userId, sessionId, exerciseId, attachment: CableAttachment | null): Promise<ActiveSession>`；動作不是 cable 時丟 `WorkoutError("bad_request")`（`WorkoutErrorCode` 沒有就新增，route 對應 400）。
  - `PATCH /workouts/:id/items/:exerciseId` body `{ attachment: CableAttachment | null }`，回傳 `ActiveSession`。

- [ ] **Step 1: 寫失敗的測試**
  - `last uses the same attachment`：上次 rope 60 kg、上上次 straight_bar 40 kg；這次 item 設 straight_bar → `last.sets[0].weightKg === 40`；改成 rope → 60。
  - `null attachment matches only null`。
  - `PR compares within attachment`：rope 的 e1RM 低於 straight_bar 的歷史最佳，但高於 rope 的歷史最佳 → 算 PR。
  - `setItemAttachment on non-cable exercise is bad_request`；route 回 400。
  - `template keeps attachment`：存成範本再開始訓練，item 的 attachment 一樣。
  - `history entry includes attachment`。
  - `advice context includes attachment label`：rope 的動作在 context 裡出現「繩索」，「上一次」取的是 rope 那次。
- [ ] **Step 2: 跑測試確認失敗**：`npm test -w @gac/api -- workouts-repo session-routes`，Expected: FAIL
- [ ] **Step 3: 實作**：`sessionDataQuery` 的 `src` 子查詢 join 前一次的 `workout_session_items`（同 session、同 exercise）和這次的 item，加條件 `prev.attachment is not distinct from cur.attachment`；PR 的 `prior` 查詢同樣 join。
- [ ] **Step 4: 跑測試確認通過**：同上，Expected: PASS
- [ ] **Step 5: Commit**：`feat(api): per-attachment last, hint and PR`

### Task 6: LIFF——選把手、照片帶入把手、紀錄頁顯示

**Files:**
- Modify: `apps/liff/src/pages/workout/ActiveWorkout.tsx`（`ExerciseCard` 加把手選單；`addExercise` 帶 attachment）
- Modify: `apps/liff/src/pages/workout/ExercisePicker.tsx`、`EquipmentPhoto.tsx`（`onPick(exercise, attachment?)`；保留 PR 11.3 的照片建立自訂動作流程）
- Modify: `apps/liff/src/pages/WorkoutHistory.tsx`（動作名稱後加「（繩索）」）
- Test: `ActiveWorkout.test.tsx`、`EquipmentPhoto.test.tsx`、`WorkoutHistory.test.tsx`

**Interfaces:**
- Consumes: `CABLE_ATTACHMENTS`、`CABLE_ATTACHMENT_LABELS`、`supportsAttachment`、`PATCH /workouts/:id/items/:exerciseId`。
- Produces: `ExercisePicker` 的 `onPick: (exercise: Exercise, attachment?: CableAttachment | null) => void`。

- [ ] **Step 1: 寫失敗的測試**
  - `cable exercise shows attachment select`：`<select aria-label="把手">` 選項第一個是「未指定」，接著 7 種標籤；非 cable 動作沒有這個選單。
  - `changing attachment PATCHes the item`：選「繩索」後送出 `PATCH .../items/{id}`，body `{"attachment":"rope"}`。
  - `photo pick passes attachment for cable candidate only`：found 的 `attachment: "rope"`，點 cable 候選 → `onPick(ex, "rope")`；點非 cable 候選 → `onPick(ex, null)`。
  - `history shows attachment label`。
- [ ] **Step 2: 跑測試確認失敗**：`npm test -w @gac/liff -- ActiveWorkout EquipmentPhoto WorkoutHistory`，Expected: FAIL
- [ ] **Step 3: 實作**（選單放在器材 badge 同一行；「上次（繩索，10/24）」在有把手時顯示把手名稱）
- [ ] **Step 4: 跑測試確認通過**：`npm test -w @gac/liff`，Expected: PASS
- [ ] **Step 5: Commit**：`feat(liff): pick cable attachment per exercise`

### Task 7: 收尾檢查與計畫備註

- [ ] `npm test`、`npx eslint apps packages`、`npx prettier --check apps packages db docs` 通過。
- [ ] 瀏覽器窗格 mobile 尺寸：加「滑輪三頭下壓」→ 選繩索 → 記一組 → 結束 → 再開始一次 → 看到「上次（繩索…）」。
- [ ] 更新「狀態」「交接備註」，commit。

## 部署

有 migration `0015`：先照現有流程跑 migration，再部署 api，最後 LIFF（舊 LIFF 不送 attachment，新 api 允許省略，所以順序錯了也不會壞）。合併後用手機拍 3–5 台器材確認推薦結果。

## 狀態

- 計畫（2026-10-26），尚未實作。
- 待使用者：Task 2 的新增動作清單確認；Task 4 的測試照片。

## 交接備註

（實作時填寫：評測結果與模型決定、和計畫不同的地方。）

## 下一個 PR 需要知道的事

- `compatibleEquipment` 是「這個動作能不能用這台器材做」的唯一判斷，之後其他地方要用就 import，不要另寫。
- 新增內建動作時，`every seeded slug has its own pose` 測試會要求同時畫圖。
- `attachment` 在 session item 與範本 item 上；比較「同一個動作」的地方（上次、加重建議、PR）都要用「動作＋把手」。本 PR 已經把 PR 11.4 的 AI 建議 context 改成遵守這個規則。
