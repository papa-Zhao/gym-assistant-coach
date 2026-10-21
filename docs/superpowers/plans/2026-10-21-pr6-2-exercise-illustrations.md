# PR 6.2: Exercise Illustrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 57 個內建動作畫上統一風格的示意圖，顯示在「選動作」清單與訓練中的動作卡片上。

**Architecture:**

- 每張圖是一筆「姿勢資料」，只含 SVG path 字串與座標，由同一個 React 元件畫出來。所以線條粗細、顏色和箭頭樣式，全部由元件統一決定。
- 資料放在 LIFF 程式碼裡，以 `slug` 對應，不需要改資料庫或 API。
- 自訂動作沒有 slug，畫不出專屬的圖，就依肌群借用一張代表圖；有氧借用跑步機的圖。
- 另有一個圖庫腳本，把所有圖產生成一頁 HTML，給審查者和使用者看圖。

**Tech Stack:** 沿用現有技術（React 19、vitest），不新增套件。

**Spec:** [docs/specs/2026-10-15-gym-assistant-coach-design.md](../../specs/2026-10-15-gym-assistant-coach-design.md) §6.4「動作提供統一風格的線條示意圖」。

## 風格定案（2026-10-21，使用者選擇「C 實心圖示＋深色箭頭」）

| 部位 | 畫法 | 顏色 token |
|---|---|---|
| 人物身體 | path，`stroke-width` 7，圓頭圓角 | `--color-primary` |
| 頭 | 實心圓，半徑 7.5 | `--color-primary` |
| 負重（槓鈴、啞鈴、握把、纜繩） | path，`stroke-width` 3.5 | `--color-text` |
| 器材（椅子、機台、地面） | path，`stroke-width` 2 | `--color-text-muted` |
| 動作方向箭頭 | path，`stroke-width` 2.5 | `--color-text` |

- 畫布 `viewBox="0 0 116 112"`。所有座標都要落在畫布內，並且至少離邊緣 4。
- 箭頭只在 `size >= 56` 時畫。40px 的清單小圖不畫箭頭。
- 圖的底色是 `--color-surface-alt`，圓角是 `--radius-sm`。
- 深色模式不另外畫一套圖，靠 token 自動換色。

## Global Constraints

- 顏色、圓角、間距只能用 token（`var(--color-*)`、`var(--radius-*)`、`var(--space-*)`），不寫死色碼。
- 不新增任何 npm 套件。
- 姿勢資料只能是數字與 SVG path 指令字串（只允許 `M L H V C Q A Z` 及其小寫）。不用 `dangerouslySetInnerHTML`，不放任何 SVG 標籤字串。
- 插圖是裝飾，因為旁邊已經有動作名稱：`<svg aria-hidden="true" focusable="false">`。
- 使用者看得到的文字一律是繁體中文。
- 不要 stage `.claude/` 和 `skills-lock.json`。

## Review Focus

1. **自訂動作**（`slug` 為 null）依 `muscleGroup` 借圖；有氧借 `treadmill-run`；兩者都沒有就用 `barbell-bench-press`。不可以出錯，也不可以留白。
2. **深色模式**：圖裡沒有任何寫死的顏色，全部跟著 token 變色。
3. **320px 寬的螢幕**：清單的每一列放 40px 圖、兩行名稱和器材標籤時，不會超出畫面，也不會擠壓標籤。
4. **之後新增內建動作但還沒畫圖**時，要退回借圖，不能讓畫面壞掉。完整性測試會在 CI 抓出缺圖。
5. **座標超出畫布**會讓圖被切掉，由測試逐一檢查每個數字。

---

### Task 1: 插圖元件、借圖規則、圖庫腳本，以及接上兩個畫面

**Files:**

- Create:
  - `apps/liff/src/illustrations/types.ts`
  - `apps/liff/src/illustrations/poses.ts`（先放 3 張樣本圖）
  - `apps/liff/src/illustrations/ExerciseIllustration.tsx`
  - `apps/liff/src/illustrations/ExerciseIllustration.test.tsx`
  - `apps/liff/scripts/illustration-gallery.tsx`
- Modify:
  - `apps/liff/src/pages/workout/ExercisePicker.tsx`（清單列，約第 196–210 行）
  - `apps/liff/src/pages/workout/ActiveWorkout.tsx`（`.exercise-head`，約第 303 行）
  - `apps/liff/src/theme.ts`
  - `apps/liff/package.json`（`gallery` script）
  - 對應的測試

**Interfaces:**

- Produces:

```ts
// types.ts
export interface Pose {
  equipment: string[];   // path d，器材
  load?: string[];       // path d，負重
  head: [number, number];
  body: string;          // path d，人物
  arrow: string;         // path d，方向箭頭
}

// poses.ts
export const POSES: Record<string, Pose>;
export const FALLBACK_BY_MUSCLE: Record<MuscleGroup, string>; // 值是 POSES 裡的 slug
export const CARDIO_FALLBACK = "treadmill-run";
export const DEFAULT_FALLBACK = "barbell-bench-press";
export function poseFor(exercise: Pick<Exercise, "slug" | "kind" | "muscleGroup">): Pose;

// ExerciseIllustration.tsx
export function ExerciseIllustration(props: {
  exercise: Pick<Exercise, "slug" | "kind" | "muscleGroup">;
  size: 40 | 64;
}): JSX.Element;
```

- 第一批 3 張圖：`barbell-bench-press`、`lat-pulldown`、`treadmill-run`，座標照樣本：

```ts
"barbell-bench-press": { equipment: ["M20 80 L96 80", "M30 80 L30 100", "M86 80 L86 100"],
  load: ["M14 38 L78 38", "M20 30 L20 46", "M72 30 L72 46"], head: [30, 68],
  body: "M37 71 L76 71 M76 71 L88 58 L96 100 M44 71 L40 56 L42 38 M52 71 L54 56 L52 38",
  arrow: "M92 46 L92 24 M86 30 L92 24 L98 30" },
"lat-pulldown": { equipment: ["M56 12 L98 12", "M98 12 L98 102", "M56 20 L56 34", "M40 84 L72 84", "M56 84 L56 102"],
  load: ["M52 16 A4 4 0 1 0 60 16 A4 4 0 1 0 52 16", "M30 34 L82 34"], head: [56, 46],
  body: "M56 53 L56 82 M56 82 L80 82 L82 102 M56 58 L42 46 L38 34 M56 58 L70 46 L74 34",
  arrow: "M18 38 L18 62 M12 56 L18 62 L24 56" },
"treadmill-run": { equipment: ["M16 96 L100 96", "M96 96 L90 56", "M90 56 L78 58"], head: [56, 26],
  body: "M56 33 L52 60 M52 60 L63 74 L59 92 M52 60 L42 72 L30 84 M55 40 L66 48 L72 40 M55 40 L46 50 L40 46",
  arrow: "M8 50 L22 50 M8 58 L18 58 M8 66 L22 66" },
```

- `FALLBACK_BY_MUSCLE` 在 Task 1 先全部指向這 3 張圖：
  - `back` → `lat-pulldown`
  - 其餘 9 個肌群 → `barbell-bench-press`

  Task 4 再改成各肌群的代表動作。

- [ ] **Step 1: 寫失敗的測試**
  - `renders pose with token colours only`：輸出的 HTML 不能含 `#`，必須含 `var(--color-primary)`。
  - `40px omits arrow, 64px draws it`
  - `is decorative`：要有 `aria-hidden="true"`。
  - `custom strength exercise borrows muscle group pose`
  - `custom cardio borrows treadmill-run`
  - `unknown slug falls back without throwing`
  - `every pose stays inside the canvas with 4 margin`：把每個 path 裡的數字取出來，x 在 4–112、y 在 4–108。用奇偶位置判斷 x 或 y；`A` 指令要跳過半徑和旗標。
  - `pose paths use only allowed commands`
  - picker 測試 `each row shows a 40px illustration`
  - ActiveWorkout 測試 `exercise card shows a 64px illustration`
- [ ] **Step 2: 執行，確認失敗。**
- [ ] **Step 3: 實作。**
  - 元件依上方風格表畫出 `<svg>`。
  - 清單列改成「圖｜名稱｜標籤」三欄。
  - 動作卡片的標題左邊放 64px 的圖。
  - `theme.ts` 新增 `.illus { background: var(--color-surface-alt); border-radius: var(--radius-sm); flex-shrink: 0; }`。
- [ ] **Step 4: 圖庫腳本**
  - `npm run gallery -w @gac/liff` 用 `react-dom/server` 輸出 `apps/liff/gallery.html`，並把這個檔案加進 `.gitignore`。
  - 每個 POSES 的 key 各一格，分別顯示 64px 與 40px 的圖，加上 slug 與中文名（從 0004 seed 解析）。
  - 頁面要有淺色、深色兩欄，token 值從 `packages/shared` 取。
  - 看圖的方法：`qlmanage -t -s 1200 -o <dir> apps/liff/gallery.html` 產生 PNG，再用 Read 打開。
- [ ] **Step 5: 跑 `npm test`、typecheck、`npm run build -w @gac/liff`、lint。** Expected: PASS
- [ ] **Step 6: Commit** `feat(liff): exercise illustration component and first poses`

### Task 2: 胸、背、肩（15 張）

**Files:**

- Modify: `apps/liff/src/illustrations/poses.ts`

**Interfaces:**

- Consumes: Task 1 的 `Pose` 格式與風格表。
- Produces: 以下 slug 的圖。
  - 胸：`incline-dumbbell-press`、`chest-press-machine`、`cable-crossover`、`push-up`、`pec-deck-fly`
  - 背：`pull-up`、`barbell-row`、`seated-cable-row`、`one-arm-dumbbell-row`、`t-bar-row`
  - 肩：`overhead-press`、`dumbbell-shoulder-press`、`shoulder-press-machine`、`dumbbell-lateral-raise`、`face-pull`
  - 外加 `lat-pulldown`、`barbell-bench-press` 兩張可微調，但不能重畫成別的風格。

**畫圖規則（Task 2–4 共用）：**

- 人物比例固定：頭半徑 7.5，軀幹長 27–30，大腿 22–26，小腿 20–24，上臂 14–17，前臂 13–16。
- 畫的是動作的「發力位置」，例如推舉畫在手臂伸直前，划船畫在拉到身體時。箭頭指向發力方向。
- 同一類器材的畫法要一致：
  - 啞鈴：短橫線加兩端短豎線
  - 纜繩：從滑輪到握把的直線
  - 機台：椅子加立柱
- 名稱相似的動作，靠器材或姿勢區分。例如槓鈴臥推和上斜啞鈴推舉，椅背角度要不同。
- 每畫完 5 張就跑一次圖庫，親自看 PNG，檢查有沒有斷肢、穿模或超出畫布。

- [ ] **Step 1:** 執行完整性測試的子集 `poses cover chest, back and shoulders slugs`（寫在 `ExerciseIllustration.test.tsx`，清單如上）。Expected: FAIL
- [ ] **Step 2:** 畫圖，每 5 張看一次圖庫。
- [ ] **Step 3:** `npm test -w @gac/liff`。Expected: PASS，畫布邊界測試也要通過。
- [ ] **Step 4:** 把圖庫 PNG 存到 `.superpowers/` 工作區，並在報告附上路徑。
- [ ] **Step 5: Commit** `feat(liff): chest, back and shoulder illustrations`

### Task 3: 手臂、核心、有氧（21 張）

**Files:**

- Modify: `apps/liff/src/illustrations/poses.ts`

**Interfaces:**

- Produces:
  - 手臂：`barbell-curl`、`dumbbell-curl`、`ez-bar-curl`、`hammer-curl`、`cable-curl`、`triceps-pushdown`、`skull-crusher`、`close-grip-bench-press`、`bench-dip`、`overhead-triceps-extension`
  - 核心：`plank`、`hanging-leg-raise`、`cable-crunch`、`ab-crunch-machine`
  - 有氧：`treadmill-incline-walk`、`outdoor-run`、`stair-climber`、`stationary-bike`、`rowing-machine`、`elliptical`、`jump-rope`
- 有氧的箭頭用「速度線」（3 條水平短線），和 `treadmill-run` 一致。
- `treadmill-incline-walk` 的跑帶要是斜的。`outdoor-run` 沒有器材，只畫地面線。

- [ ] **Step 1:** `poses cover arms, core and cardio slugs`。Expected: FAIL
- [ ] **Step 2–4:** 同 Task 2。
- [ ] **Step 5: Commit** `feat(liff): arm, core and cardio illustrations`

### Task 4: 腿、臀、小腿（18 張），完整性測試，以及借圖改用代表動作

**Files:**

- Modify:
  - `apps/liff/src/illustrations/poses.ts`
  - `ExerciseIllustration.test.tsx`

**Interfaces:**

- Produces:
  - 股四頭、腿後、臀：`barbell-back-squat`、`smith-machine-squat`、`leg-press`、`leg-extension`、`goblet-squat`、`bodyweight-squat`、`romanian-deadlift`、`seated-leg-curl`、`lying-leg-curl`、`dumbbell-romanian-deadlift`、`barbell-hip-thrust`、`glute-bridge`、`kettlebell-swing`、`cable-kickback`
  - 小腿：`standing-calf-raise`、`seated-calf-raise`、`smith-machine-calf-raise`、`bodyweight-calf-raise`
- `FALLBACK_BY_MUSCLE` 改成每個 `MUSCLE_GROUPS` 都指向該肌群最典型的動作：
  - `chest`：`barbell-bench-press`
  - `back`：`lat-pulldown`
  - `shoulders`：`overhead-press`
  - `biceps`：`dumbbell-curl`
  - `triceps`：`triceps-pushdown`
  - `quads`：`barbell-back-squat`
  - `hamstrings`：`romanian-deadlift`
  - `glutes`：`barbell-hip-thrust`
  - `calves`：`standing-calf-raise`
  - `core`：`plank`

- [ ] **Step 1: 寫失敗的測試**
  - `every seeded exercise has a pose`：解析 `db/migrations/0004_seed_exercises.sql` 裡的 57 個 slug，每個都要在 `POSES` 裡。
  - `POSES has no slug outside the seed`
  - `every muscle group fallback points at an existing pose`
- [ ] **Step 2–4:** 同 Task 2。
- [ ] **Step 5: Commit** `feat(liff): leg and calf illustrations, full coverage`

### Task 5: 使用者看圖驗收（controller 執行）

- [ ] 跑圖庫，把 `gallery.html` 用 Artifact 發布（私人連結）給使用者，請他逐張看。
- [ ] 使用者指出的圖，交給負責該 Task 的 implementer 修改。修改後重跑圖庫，再給使用者看。
- [ ] 使用者核准後，才進行整個分支的總審查、建立 PR 與合併部署。
- [ ] 部署後，請使用者用手機確認清單與卡片的顯示，包括深色模式和 320px 寬的螢幕。
