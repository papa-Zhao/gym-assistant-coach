# PR 11.3: 自訂動作用器材照片當圖示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 拍器材照片後建立的自訂動作，用那張照片的縮圖當動作圖示，不再借用其他動作的圖。

**Architecture:** LIFF 在辨識時已經有縮小後的照片（`resizePhoto` 的 Blob），把它留在 `PhotoPhase` 裡。建立自訂動作成功後，另外 `PUT /exercises/:id/photo` 上傳；api 用 sharp 裁成 192×192 的 JPEG 縮圖，存在 `exercises.photo_thumb`（bytea）。`Exercise` 型別加 `photoUrl`（data URL），`ExerciseIllustration` 有照片就顯示照片。不用 GCS：縮圖很小（約 6–10 KB），自訂動作數量也少，存在資料庫就不需要簽名網址、bucket 生命週期規則和另外的刪除流程，刪除帳號時跟著 cascade 刪掉。

**Tech Stack:** 現有套件（sharp 已在 api 使用）。

**Spec:** 2026-10-26 手機測試回饋第 3 項，使用者選方案 A；PR 8.2 器材照片計畫；PR 10.3 政策定稿（`CONSENT_VERSION` 規則）。

**前一份計畫：** PR 11.1 休息計時（已合併）（2026-10-30 調整順序：11.3 → 11.4 → 11.2）。PR 11.2 延後到 11.4 之後，本 PR 不依賴它；本 PR 改的 `EquipmentPhoto.tsx`、`ExercisePicker.tsx` 之後由 11.2 接著改。

## 已決定（2026-10-26，使用者同意）

1. 用照片建立的自訂動作，以該照片當圖示（方案 A）。

## 規劃時的決定（我替你做的，需要你確認的打 ⚠️）

1. ⚠️ **隱私權政策要改，所有人要重新同意一次。** 政策現在寫「器材照片：只用來辨識器材，辨識完不會儲存照片」。改成會保存縮圖，屬於實質變更，照 PR 10.3 定下的規則要更新 `CONSENT_VERSION`（`packages/shared/src/auth.ts` 和 `apps/bot/app/settings.py` 兩邊）。為了只讓大家重新同意一次，**PR 11.4 會用到的政策文字（AI 訓練建議會把訓練紀錄送給 Anthropic）也在這個 PR 一起寫進去**。
2. **只存縮圖，不存原圖**：192×192、中央裁切、JPEG 品質 70，存之前檢查不超過 32 KB（超過就用品質 50 再壓一次，還是超過就拒絕）。
3. **縮圖存在 `exercises.photo_thumb bytea`**，只允許在自訂動作上（check：`photo_thumb is null or is_custom`）。
4. **刪除自訂動作時一起刪縮圖**：`archiveCustomExercise` 封存（有紀錄還在用）時也把 `photo_thumb` 設成 null，讓政策可以寫「刪除該動作時一併刪除」。
5. **匯出資料不含照片**（政策已經這樣寫），`export.ts` 不選這個欄位。
6. **上傳失敗不影響建立動作**：動作已經建好，只顯示「照片沒有存成功，動作已經建立」。
7. **`photoUrl` 只在有縮圖時才有值**（`string | null`）；內建動作永遠是 null。api 回傳 `data:image/jpeg;base64,...`。
8. 這次不做「幫現有的自訂動作補拍照片」（之後有需要再加；API 已經支援）。

## Global Constraints

- 使用者看得到的文字一律是繁體中文。
- 政策頁的新文字（原樣寫入，取代「器材照片：只用來辨識器材，辨識完不會儲存照片」那一條）：
  - 「器材照片：只用來辨識器材，辨識完不會儲存原始照片。你用照片建立自訂動作時，會保存一張縮小的照片（192×192）當作該動作的圖示；刪除該動作或帳號時一併刪除。」
- AI 處理那一條加上「使用 AI 訓練建議時的訓練紀錄」（給 PR 11.4 用）。
- 政策頁與條款頁上的 `版本 {CONSENT_VERSION}` 必須和程式一致（`legal.test.ts` 會檢查）；新版本是實作當天的日期。
- 上傳限制沿用 `MEAL_PHOTO_MAX_BYTES`；只有動作的擁有者、而且動作沒有封存時才能上傳，否則 404。
- migration 編號接在現有最後一號 `0012` 之後（本 PR 為 `0013`）。
- 不要 stage `.claude/` 和 `skills-lock.json`。

## Review Focus

1. **別人的自訂動作 id**：上傳照片要回 404，不能洩漏存在與否。
2. **辨識後按「重新拍」再建立動作**：用的是最後一張照片，不是第一張。
3. **辨識後回到搜尋、手動建立自訂動作**：沒有照片，不能沿用之前那張。
4. **不是圖片的檔案**：回 400 `invalid_image`，動作本身不受影響。
5. **進行中的訓練裡已有這個動作**：上傳後，訓練畫面重新載入時要看到照片（`ActiveSession` 裡的 exercise 也帶 `photoUrl`）。

---

### Task 1: 縮圖欄位與產生縮圖

**Files:**
- Modify: `apps/api/src/db/schema.ts`、Create: `db/migrations/0013_exercise_photo_thumb.sql`（drizzle-kit 產生）
- Modify: `apps/api/src/photos/image.ts`（`makeThumbnail`）
- Modify: `packages/shared/src/workouts.ts`（`Exercise.photoUrl: string | null`）
- Modify: `apps/api/src/workouts/repo.ts`（`toExercise` 產生 data URL；`archiveCustomExercise` 清掉縮圖）
- Test: `apps/api/test/photo-image.test.ts`、`apps/api/test/workouts-repo.test.ts`

**Interfaces:**
- Produces:
  - `THUMB_EDGE = 192`、`THUMB_MAX_BYTES = 32 * 1024`
  - `makeThumbnail(image: Buffer): Promise<Buffer>`：不是圖片時丟 `InvalidImage`；超過上限時丟 `InvalidImage`。
  - `setExercisePhoto(db: Db, userId: string, exerciseId: string, thumb: Buffer): Promise<Exercise>`：不是自己的、不是自訂、已封存都丟 `WorkoutError("not_found")`。

- [ ] **Step 1: 寫失敗的測試**
  - `makeThumbnail returns a 192x192 jpeg under 32KB`（用 sharp 產生 1024×768 測試圖，`sharp(out).metadata()` 斷言寬高 192、format jpeg、`out.length <= 32768`）。
  - `makeThumbnail rejects non-images`。
  - `setExercisePhoto then list returns a data URL`：`photoUrl` 開頭是 `data:image/jpeg;base64,`。
  - `setExercisePhoto on another user's exercise is not_found`；`on a built-in is not_found`。
  - `archiving a used custom exercise clears its photo`。
  - `built-in exercises have null photoUrl`。
- [ ] **Step 2: 跑測試確認失敗**：`npm test -w @gac/api -- photo-image workouts-repo`，Expected: FAIL
- [ ] **Step 3: 實作**
- [ ] **Step 4: 跑測試確認通過**：同上，Expected: PASS
- [ ] **Step 5: Commit**：`feat(api): exercise photo thumbnail storage`

### Task 2: 上傳照片的 API

**Files:**
- Modify: `apps/api/src/workouts/exercise-routes.ts`（`PUT /exercises/:id/photo`）
- Modify: `apps/api/src/users/export.ts`（確認沒有選 `photo_thumb`）
- Test: `apps/api/test/exercise-template-routes.test.ts`、`apps/api/test/export.test.ts`

**Interfaces:**
- Produces: `PUT /exercises/:id/photo`，`content-type: application/octet-stream`，`bodyLimit: MEAL_PHOTO_MAX_BYTES`；成功回 200 與更新後的 `Exercise`；非 buffer 回 415；`InvalidImage` 回 400 `{ error: "invalid_image" }`；找不到回 404。

- [ ] **Step 1: 寫失敗的測試**：上面列的每個狀態碼各一個；`export does not include photo bytes`（匯出 JSON 字串不含 `photo`）。
- [ ] **Step 2: 跑測試確認失敗**：`npm test -w @gac/api -- exercise-template-routes export`，Expected: FAIL
- [ ] **Step 3: 實作**（octet-stream parser 已經在這個 plugin 註冊）
- [ ] **Step 4: 跑測試確認通過**：同上，Expected: PASS
- [ ] **Step 5: Commit**：`feat(api): upload photo for a custom exercise`

### Task 3: LIFF——保留照片、建立後上傳、顯示縮圖

**Files:**
- Modify: `apps/liff/src/pages/workout/EquipmentPhoto.tsx`（found phase 加 `photo: Blob`；`onCustom(suggestion, photo)`）
- Modify: `apps/liff/src/pages/workout/ExercisePicker.tsx`（自訂表單收到 `photo` 時，建立後 `PUT /exercises/{id}/photo`）
- Modify: `apps/liff/src/illustrations/ExerciseIllustration.tsx`（有 `photoUrl` 就 render `<img>`）
- Modify: `apps/liff/src/theme.ts`（`.illus-photo { object-fit: cover; border-radius: var(--radius-sm); }`）
- Test: `EquipmentPhoto.test.tsx`、`ExercisePicker.test.tsx`、`ExerciseIllustration.test.tsx`

**Interfaces:**
- Consumes: `PUT /exercises/:id/photo`（Task 2）、`Exercise.photoUrl`（Task 1）。
- Produces: `ExerciseIllustration` 的 `exercise` prop 型別加 `"photoUrl"`；`EquipmentPhoto` 的 `onCustom: (suggestion: ExerciseSuggestion, photo: Blob | null) => void`。

- [ ] **Step 1: 寫失敗的測試**
  - `ExerciseIllustration renders the photo when present`：`img` 的 `src` 是 `photoUrl`、`alt=""`、寬高等於 `size`；沒有 `photoUrl` 時仍是 svg。
  - `custom from photo uploads the photo after create`：`apiFetch` 依序收到 `POST /exercises`、`PUT /exercises/{id}/photo`（body 是同一個 Blob）。
  - `custom from search has no photo upload`。
  - `retake uses the latest photo`。
  - `photo upload failure still adds the exercise`：PUT 失敗時仍呼叫 `onPick(created)`，並顯示「照片沒有存成功，動作已經建立」。
- [ ] **Step 2: 跑測試確認失敗**：`npm test -w @gac/liff -- EquipmentPhoto ExercisePicker ExerciseIllustration`，Expected: FAIL
- [ ] **Step 3: 實作**（上傳成功時用回傳的 `Exercise`（含 `photoUrl`）呼叫 `onPick`）
- [ ] **Step 4: 跑測試確認通過**：`npm test -w @gac/liff`，Expected: PASS
- [ ] **Step 5: Commit**：`feat(liff): use equipment photo as custom exercise icon`

### Task 4: 政策頁與同意版本

**Files:**
- Modify: `apps/liff/public/privacy.html`（Global Constraints 的兩處文字、版本）
- Modify: `apps/liff/public/terms.html`（版本）
- Modify: `packages/shared/src/auth.ts`、`apps/bot/app/settings.py`（`CONSENT_VERSION`）
- Test: `apps/liff/src/legal.test.ts`（既有測試會檢查版本一致）、`apps/bot/tests`

- [ ] **Step 1:** 改文字與版本。
- [ ] **Step 2:** `npm test -w @gac/liff -- legal`、`cd apps/bot && uv run pytest`，Expected: PASS
- [ ] **Step 3: Commit**：`docs(legal): store exercise photo thumbnails; consent version bump`

### Task 5: 收尾檢查與計畫備註

- [ ] `npm test`、`npx eslint apps packages`、`npx prettier --check apps packages db docs` 通過。
- [ ] 瀏覽器窗格：拍器材（用測試圖）→ 都不是？建立自訂動作 → 動作卡片顯示照片縮圖。
- [ ] 更新「狀態」「交接備註」，commit。

## 部署

有 migration `0013`：先 migration，再 api，再 LIFF，最後 bot（同意版本）。部署後所有使用者下次互動會看到同意卡片（預期行為）。用手機確認同意卡片、照片縮圖。

## 狀態

- 已合併：[PR #29](https://github.com/papa-Zhao/gym-assistant-coach/pull/29)，merge commit `284b8bc`（2026-10-31 確認）。
- 政策改版、所有人重新同意一次：使用者 2026-10-26 已同意。`CONSENT_VERSION` 為 `2026-10-30`。
- 待確認：實體手機驗證（見「部署」）——同意卡片出現、拍器材後建立自訂動作有照片圖示、重新整理後照片還在。

## 交接備註

- PGlite 讀 `bytea` 回傳的是 `Uint8Array` 不是 `Buffer`，`toExercise` 用 `Buffer.from(...)` 再轉 base64。
- `ApiError` 加了 `invalid_image`（`packages/shared/src/auth.ts`）。
- 照片上傳失敗的提示：`ExercisePicker` 選完動作後會關掉，所以多了選用的 `onNotice` prop；`ActiveWorkout` 用獨立的 `notice` state 顯示（不用 `error`，因為 `mutate` 會清掉 `error`），重新打開選動作時清掉。
- `PUT /exercises/:id/photo` 沒有加 rate limit，和 `/exercises/identify` 一致。
- 瀏覽器窗格 375 px 確認：訓練畫面的動作卡片和選動作清單都顯示照片縮圖，大小與圓角和內建圖示一致。

## 下一個 PR 需要知道的事

- 本 PR 已經把「AI 訓練建議會把訓練紀錄送給 Anthropic」寫進政策；PR 11.4 不用再改 `CONSENT_VERSION`，除非內容和這裡寫的不同。
- 下一個是 PR 11.4，migration 用 `0014`。PR 11.2 排在最後，要在本 PR 改過的 `EquipmentPhoto.tsx`、`ExercisePicker.tsx` 上加把手（`onPick` 帶 attachment），不要蓋掉「都不是？建立自訂動作」帶照片的流程。
- `makeThumbnail` 可以重用在其他需要小圖示的地方。
- `Exercise.photoUrl` 是 data URL，會跟著 `ActiveSession`、範本、訓練紀錄一起回傳；不要在列表 API 裡加大縮圖尺寸。
