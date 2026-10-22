# PR 7.1: 食物資料庫與手動記錄飲食 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 匯入食藥署食品營養成分資料。使用者可以在 LIFF 搜尋食物、手動記錄一餐、修改份量，今日總覽顯示真的攝取量。

**Architecture:**

- 新增三張表：`foods`、`meals`、`meal_items`。
- 食藥署 CSV 由一支腳本轉成 seed migration，commit 的是產生出來的 SQL，原始 CSV（66 MB）不進 repo。
- 營養值在新增品項時，由 `foods` 每 100 克的數值乘上克數算出來，存在 `meal_items`。之後修改 `foods` 不會影響歷史紀錄（規格 §5）。
- 「今日攝取」查詢時即時加總，函式寫在 repo 層，7.2 的 AI 草稿也會用到。
- LIFF「我的紀錄」頁的飲食卡片改成真的功能，另新增「修改這一餐」頁。版面依核准的設計稿 `Liff-Records`、`Liff-MealEdit`。

**Tech Stack:** 沿用現有技術：Fastify 5、drizzle、postgres.js、pglite 測試；React 19、vitest。不新增 npm 套件。

**Spec:** [docs/specs/2026-10-15-gym-assistant-coach-design.md](../../specs/2026-10-15-gym-assistant-coach-design.md) §5 `foods`／`meals`／`meal_items`、§6.5 確認流程、§6.7 今日總覽、§10 PR 7。

**範圍：** 7.1 不含 AI。文字記一餐（AI 解析）、Flex 確認卡片、每日次數上限、Anthropic 金鑰都在 7.2。

## 已決定（2026-10-22）

- **資料來源：** 食藥署「食品營養成分資料集」，data.gov.tw 資料集 8543，下載網址 `https://data.fda.gov.tw/data/opendata/export/20/csv`（ZIP，內含 `20_2.csv`，UTF-8 BOM）。授權是政府資料開放授權條款第 1 版，必須標示來源。
- **CSV 結構：** 每列是「一個食物 × 一個分析項」，共 230,152 列，2,213 個食物（以 `整合編號` 區分，樣品名稱不重複）。每 100 克的值取這些分析項：
  - `熱量`（kcal）
  - `粗蛋白`（g）
  - `總碳水化合物`（g）
  - `粗脂肪`（g）

  有 30 個食物沒有 `粗蛋白`，存成 null。數值欄位前面有空白，要 trim。
- **搜尋要比對 `俗名`。** 例如「高麗菜」只出現在「甘藍(圓球形)」的俗名裡，「雞胸」只出現在「去皮清肉(肉雞)」的俗名裡。
- **`每單位重` 不用。** 它是取樣時一個樣品的重量（例如鮭魚切片 274 克），不是一份的份量。食藥署的資料 `serving_desc` 留 null。
- **`daily_summaries` 這次不建。** 今日攝取用查詢加總，資料量小時夠快。等趨勢圖需要時再建表並回填。這和規格 §5 的「寫入時更新」不同，PR 說明裡要寫出來。
- **一天同一餐別可以有多筆餐點。** 拍照記錄可能在同一餐傳兩張照片，所以不設唯一限制。「我的紀錄」頁每筆餐點列一行。
- **計入今日攝取的餐點：** `confirmed` 的餐點，加上 24 小時內建立的 `draft`（規格 §6.5 第 7 點）。7.1 手動記錄一律直接存成 `confirmed`。

## Global Constraints

- 使用者看得到的文字一律是繁體中文。
- 顏色、圓角、間距只能用 token（`var(--color-*)`、`var(--radius-*)`、`var(--space-*)`），不寫死色碼。
- 不新增任何 npm 套件。
- 主鍵是 `uuid`，時間是 `timestamptz`，「哪一天」用 Asia/Taipei 日期存成 `date`（`taipeiDate()` 在 `packages/shared/src/targets.ts`）。
- 營養數值：熱量取整數 kcal；蛋白質、碳水、脂肪取到小數 1 位 g。四捨五入只在存進 `meal_items` 時做一次，加總時不再四捨五入。
- 克數範圍是 1–2000，可以有小數 1 位。一餐最多 30 個品項。
- API 只能存取自己的餐點：別人的 `meal id` 一律回 404，不回 403。
- log 不記錄食物名稱、克數或任何飲食內容（規格 §8.4）。
- 所有 LIFF 頁面在 320px 寬、淺色與深色模式都要能用。觸控目標至少 44px。
- 「資料來源：衛生福利部食品藥物管理署 食品營養成分資料庫」要顯示在食物搜尋結果下方。
- 不要 stage `.claude/` 和 `skills-lock.json`。

## Review Focus

1. **搜尋字串含 `%`、`_`、`\`** 時要當成一般字元比對，不能變成萬用字元。沿用 `listExercises` 的跳脫寫法。（Task 3 測試）
2. **別人的餐點**：GET、PUT、DELETE 別人的 `meal id` 都回 404，資料不變。（Task 4 測試）
3. **克數邊界**：0、0.5、負數、2000.1、小數超過 1 位、非數字都回 400；1、150.5 和 2000 合法。（Task 1、Task 4 測試）
4. **沒有蛋白質數值的食物**（`protein_per_100g` 為 null）加進餐點時，蛋白質算 0，不能讓 API 出錯或存成 NaN。（Task 1、Task 3 測試）
5. **台北時間跨日**：UTC 15:59 和 16:00 分屬台北的兩天。「今日」以台北日期為準，不用伺服器時區。（Task 3 測試）

---

### Task 1: 共用型別與營養計算

**Files:**

- Create:
  - `packages/shared/src/meals.ts`
  - `packages/shared/src/meals.test.ts`
- Modify: `packages/shared/src/index.ts`（加 `export * from "./meals";`）

**Interfaces:**

- Produces:

  ```ts
  export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
  export type MealType = (typeof MEAL_TYPES)[number];
  export const MEAL_TYPE_LABELS: Record<MealType, string>; // 早餐、午餐、晚餐、點心
  export const MEAL_STATUSES = ["draft", "confirmed"] as const;
  export type MealStatus = (typeof MEAL_STATUSES)[number];
  export const MEAL_SOURCES = ["photo", "text", "manual", "copy"] as const;
  export type MealSource = (typeof MEAL_SOURCES)[number];
  export const FOOD_SOURCES = ["tfda", "custom", "ai"] as const;
  export type FoodSource = (typeof FOOD_SOURCES)[number];
  export const GRAMS_LIMITS = { min: 1, max: 2000 } as const;
  export const MAX_MEAL_ITEMS = 30;

  export interface Nutrition { kcal: number; proteinG: number; carbG: number; fatG: number; }
  export interface Food {
    id: string; source: FoodSource; name: string; aliases: string | null;
    category: string | null;
    per100g: { kcal: number; proteinG: number | null; carbG: number | null; fatG: number | null };
  }
  export interface MealItem extends Nutrition { id: string; foodId: string | null; name: string; grams: number; }
  export interface Meal {
    id: string; eatenOn: string; mealType: MealType; status: MealStatus; source: MealSource;
    items: MealItem[]; total: Nutrition;
  }
  export interface DayMeals { date: string; meals: Meal[]; consumed: Nutrition; }
  export interface MealItemInput { id?: string; foodId?: string; grams: number; }
  export interface MealInput { eatenOn: string; mealType: MealType; items: MealItemInput[]; }

  export function nutritionFor(per100g: Food["per100g"], grams: number): Nutrition;
  export function scaleNutrition(n: Nutrition, fromGrams: number, toGrams: number): Nutrition;
  export function sumNutrition(list: Nutrition[]): Nutrition;
  export function defaultMealType(taipeiHour: number): MealType;
  export function isValidGrams(g: number): boolean;
  ```

- [ ] **Step 1: 寫失敗的測試** `meals.test.ts`
  - `nutritionFor({kcal:183,proteinG:22.4,carbG:0,fatG:9.7}, 150)` → `{kcal:275, proteinG:33.6, carbG:0, fatG:14.6}`（kcal 取整數，其餘小數 1 位）。
  - `nutritionFor({kcal:100,proteinG:null,carbG:null,fatG:null}, 50)` → `{kcal:50, proteinG:0, carbG:0, fatG:0}`。
  - `scaleNutrition({kcal:380,proteinG:34,carbG:2,fatG:24}, 180, 90)` → `{kcal:190, proteinG:17, carbG:1, fatG:12}`；`fromGrams` 為 0 時丟出錯誤。
  - `sumNutrition([])` → 全部 0；`sumNutrition([{kcal:1,proteinG:0.1,…},{kcal:2,proteinG:0.2,…}])` 的 `proteinG` 是 `0.3`，不是 `0.30000000000000004`（加總後以小數 1 位修正浮點誤差）。
  - `defaultMealType`：4–10 點是 `breakfast`，11–14 點是 `lunch`，17–21 點是 `dinner`，其他時間是 `snack`。
  - `isValidGrams`：1、2000、150.5 為 true；0、-1、2000.1、0.5、`NaN`、150.55 為 false。
- [ ] **Step 2:** `npm test -w @gac/shared`。Expected: FAIL（模組不存在）。
- [ ] **Step 3:** 實作 `meals.ts`。
- [ ] **Step 4:** `npm test -w @gac/shared` 和 `npm run typecheck`。Expected: PASS。
- [ ] **Step 5: Commit** `feat(shared): meal types and nutrition math`

---

### Task 2: 資料表、migration 與食藥署匯入腳本

**Files:**

- Modify: `apps/api/src/db/schema.ts`
- Create:
  - `db/migrations/0006_foods_meals.sql`（由 `npm run db:generate -w @gac/api` 產生）
  - `apps/api/scripts/tfda-seed.ts`
  - `apps/api/scripts/tfda-seed.test.ts`
  - `apps/api/scripts/fixtures/tfda-sample.csv`（從真實 CSV 取 3 個食物的所有列，含一個沒有 `粗蛋白` 的食物，以及一個名稱或俗名含單引號或逗號的食物，如果有）
  - `db/migrations/0007_seed_tfda_foods.sql`（由腳本產生，以 `drizzle-kit generate --custom --name seed_tfda_foods` 建立空檔與 journal 項目後寫入）
- Modify: `apps/api/package.json`（加 script `"tfda:seed": "tsx scripts/tfda-seed.ts"`）

**Interfaces:**

- Produces（schema，欄位名照規格 §5）：
  - `foods`
    - `id uuid pk`
    - `source text not null`（check 在 `FOOD_SOURCES`）
    - `source_ref text`（食藥署 `整合編號`；`(source, source_ref)` 唯一）
    - `name text not null`
    - `aliases text`
    - `category text`
    - `kcal_per_100g numeric(6,1) not null`
    - `protein_per_100g`、`carb_per_100g`、`fat_per_100g`：`numeric(6,1)`，可為 null
    - `serving_desc text`
    - `owner_user_id uuid references users`（7.1 不用，給自訂食物預留）
    - `created_at`
  - `meals`
    - `id`
    - `user_id not null references users`
    - `eaten_on date not null`
    - `meal_type text not null`、`status text not null`、`source text not null`（各自 check 在對應常數）
    - `created_at`、`updated_at`、`confirmed_at timestamptz`
    - index `(user_id, eaten_on)`
  - `meal_items`
    - `id`
    - `meal_id not null references meals on delete cascade`
    - `position integer not null`
    - `food_id uuid references foods`（可為 null）
    - `name text not null`
    - `grams numeric(6,1) not null`
    - `kcal integer not null`
    - `protein_g`、`carb_g`、`fat_g`：`numeric(6,1) not null`
    - `ai_confidence numeric(3,2)`
    - unique `(meal_id, position)`
- Produces（腳本）：
  - `export function parseTfdaCsv(csv: string): TfdaFood[]`，`TfdaFood = { ref, name, aliases, category, kcal, proteinG, carbG, fatG }`，數值是 `number | null`。
  - `export function seedSql(foods: TfdaFood[]): string`：產生 `insert into "foods" (...) values ... on conflict ("source", "source_ref") do update set ...`。字串用 `''` 跳脫單引號。依 `ref` 排序，讓重跑的結果一樣。
  - CLI：`npm run tfda:seed -w @gac/api -- <20_2.csv 路徑> <輸出 sql 路徑>`。

- [ ] **Step 1: 寫失敗的測試** `tfda-seed.test.ts`（讀 fixture）
  - `parseTfdaCsv` 回傳 3 筆，第一筆的 `name`、`aliases`、`kcal`、`proteinG` 等於 fixture 裡的值（數值已 trim、轉成 number）。
  - 沒有 `粗蛋白` 的那筆 `proteinG` 為 `null`。
  - CSV 開頭的 BOM 不會跑進第一個欄位名稱。
  - `seedSql` 的輸出含 `on conflict ("source", "source_ref") do update`，單引號已跳脫，`null` 值寫成 SQL `null`。
- [ ] **Step 2:** `npm test -w @gac/api -- tfda-seed`。Expected: FAIL。
- [ ] **Step 3:** 改 `schema.ts`，跑 `npm run db:generate -w @gac/api` 產生 `0006_foods_meals.sql`，檢查產生的 SQL 有所有 check、unique 和 index。
- [ ] **Step 4:** 實作 `tfda-seed.ts`。CSV 解析要處理雙引號包住、欄位內含逗號的情況（不加套件，自己寫最小的 RFC 4180 解析）。
- [ ] **Step 5:** 下載真實資料到 scratchpad 的新資料夾，執行腳本產生 `0007_seed_tfda_foods.sql`。確認：
  - 剛好 2,213 筆。
  - 在 pglite 上依序套用 0000–0007 都成功。
  - 「白飯」、「甘藍(圓球形)」、「去皮清肉(肉雞)」都在裡面。
- [ ] **Step 6:** `npm test -w @gac/api` 和 `npm run typecheck`。Expected: PASS（`apps/api/test/db.ts` 會套用全部 migration）。每個測試檔都會重新套用 2,213 筆 seed，請在報告裡寫出改動前後 `npm test -w @gac/api` 的總時間。如果時間多於原本的 2 倍，在報告裡提出來，不要自己改測試架構。
- [ ] **Step 7: Commit** `feat(api): foods and meals tables with TFDA nutrition seed`

---

### Task 3: 飲食 repo

**Files:**

- Create:
  - `apps/api/src/meals/repo.ts`
  - `apps/api/test/meals-repo.test.ts`

**Interfaces:**

- Consumes: Task 1 的型別與 `nutritionFor`、`scaleNutrition`、`sumNutrition`；Task 2 的 schema。
- Produces:

  ```ts
  export function searchFoods(db: Db, q: string, limit?: number): Promise<Food[]>; // limit 預設 20
  export function getMeal(db: Db, userId: string, mealId: string): Promise<Meal | null>;
  export function listDayMeals(db: Db, userId: string, date: string, now: Date): Promise<DayMeals>;
  export function createMeal(db: Db, userId: string, input: MealInput, source: MealSource, now: Date): Promise<Meal>;
  export function updateMeal(db: Db, userId: string, mealId: string, input: Omit<MealInput, "eatenOn">, now: Date): Promise<Meal | null>;
  export function deleteMeal(db: Db, userId: string, mealId: string): Promise<boolean>;
  export function consumedOn(db: Db, userId: string, date: string, now: Date): Promise<Nutrition>;
  export class MealInputError extends Error { constructor(public code: "unknown_food" | "unknown_item" | "empty" | "too_many"); }
  ```

  - `searchFoods` 用 `name` 或 `aliases` 做 ilike 比對（跳脫 `% _ \`）。排序依序是：名稱完全相同、名稱開頭符合、名稱包含、只有俗名符合；同一級裡名稱短的在前。
  - `createMeal`、`updateMeal` 的品項處理：
    - `foodId` 的品項：用 `nutritionFor` 從 `foods` 算營養值，`name` 抄食物名稱。
    - `id` 的品項（既有品項）：用 `scaleNutrition` 依新克數等比例換算。
    - 沒列出的既有品項刪除。
    - 品項順序就是 `position`。
    - 未知的 `foodId`、不屬於這一餐的 `id`、0 個品項、超過 30 個品項，丟 `MealInputError`。
    - 整個操作在一個交易裡。
  - `updateMeal` 把 `status` 設成 `confirmed`，並寫入 `confirmed_at`（「儲存並確認」）。
  - `consumedOn` 加總 `eaten_on = date` 且（`status = 'confirmed'`，或 `status = 'draft'` 且 `created_at > now - 24h`）的品項。
  - 所有函式都用 `user_id` 過濾，別人的餐點回 `null`／`false`。

- [ ] **Step 1: 寫失敗的測試** `meals-repo.test.ts`（用 `test/db.ts` 的 pglite，先插入幾筆測試用 foods）
  - `searchFoods(db, "高麗菜")` 找到俗名含高麗菜的食物。
  - `searchFoods(db, "白飯")` 第一筆是名稱完全相同的「白飯」。
  - `searchFoods(db, "100%")` 不會把 `%` 當萬用字元。
  - `createMeal` 用 150 g 的一筆食物，回傳的品項營養值等於 `nutritionFor` 的結果，`total` 正確，`status` 是 `confirmed`、`source` 是 `manual`。
  - `protein_per_100g` 為 null 的食物，加入後 `proteinG` 是 0。
  - `updateMeal`：
    - 把既有品項從 180 g 改成 90 g，營養值減半。
    - 省略某個既有品項，該品項被刪除。
    - 新增 `foodId` 品項會被加進去。
    - 傳入別人的 meal id 回 `null`，資料不變。
  - `updateMeal` 傳入另一餐的 item id，丟 `MealInputError("unknown_item")`，且資料沒有任何改變（交易回滾）。
  - `listDayMeals` 依 `meal_type`（早、午、晚、點心）再依 `created_at` 排序。`consumed` 不含 25 小時前建立的 `draft`，含 1 小時前的 `draft`。
  - `consumedOn` 不含其他日期的餐點。台北日期 `2026-10-22` 的餐點，不會出現在 `2026-10-21`。
  - `deleteMeal` 刪別人的餐點回 `false`；刪自己的回 `true`，品項一起刪除。
- [ ] **Step 2:** `npm test -w @gac/api -- meals-repo`。Expected: FAIL。
- [ ] **Step 3:** 實作 `repo.ts`。
- [ ] **Step 4:** `npm test -w @gac/api`。Expected: PASS。
- [ ] **Step 5: Commit** `feat(api): meal and food repository`

---

### Task 4: 飲食 API，以及今日總覽的攝取量

**Files:**

- Create:
  - `apps/api/src/meals/routes.ts`
  - `apps/api/test/meal-routes.test.ts`
- Modify:
  - `apps/api/src/app.ts`（註冊 `mealRoutes(deps)`）
  - `apps/api/src/internal/routes.ts`（`/users/today` 的 `consumed` 改用 `consumedOn`）
  - `apps/api/test/internal.test.ts`

**Interfaces:**

- Consumes: Task 3 的 repo；現有 LIFF 驗證方式（照 `workouts/http.ts` 的 `workoutAuth` 寫法）。
- Produces（全部需要 LIFF session）：
  - `GET /foods?q=` → `{ foods: Food[] }`。`q` 長度 1–40，必填。
  - `GET /meals?date=YYYY-MM-DD` → `DayMeals`。`date` 選填，預設今天（台北日期）。
  - `GET /meals/:id` → `Meal`，找不到回 404。
  - `POST /meals`，body `MealInput` → 201 `Meal`。`source` 固定是 `manual`。
  - `PUT /meals/:id`，body `{ mealType, items }` → `Meal`。
  - `DELETE /meals/:id` → 204；找不到回 404。
  - JSON schema 檢查：
    - `grams` 是 `number`，`minimum` 1、`maximum` 2000、`multipleOf` 0.1。
    - `items` 最多 30 項。
    - `date` 格式是 `YYYY-MM-DD`。
  - `MealInputError` 對應 400，回傳 `{ error: code }`。
  - `internal /users/today` 回傳的 `consumed` 是 `consumedOn` 的結果。

- [ ] **Step 1: 寫失敗的測試** `meal-routes.test.ts`（照 `session-routes.test.ts` 的 app 建立與登入方式）
  - 未登入呼叫任一路由回 401。
  - `GET /foods?q=白飯` 回 200，結果含白飯；`q` 空字串回 400。
  - `POST /meals` 成功回 201，`GET /meals?date=` 看得到這一餐，`consumed` 等於這一餐的 `total`。
  - 這些 grams 回 400：0、-5、2000.1、0.55、`"150"`（字串）。
  - 31 個品項回 400。
  - 使用者 B 對使用者 A 的餐點做 GET、PUT、DELETE 都回 404，之後 A 讀到的資料不變。
  - `PUT` 帶未知的 `foodId` 回 400 `{ error: "unknown_food" }`。
  - `DELETE` 後再 `GET` 回 404。
  - `internal.test.ts`：新增一筆今天的 confirmed 餐點後，`/internal/users/today` 的 `consumed.kcal` 等於該餐熱量。
- [ ] **Step 2:** `npm test -w @gac/api -- meal-routes internal`。Expected: FAIL。
- [ ] **Step 3:** 實作 routes，並改 `app.ts`、`internal/routes.ts`。
- [ ] **Step 4:** `npm test -w @gac/api`、`npm run typecheck`、`npm run lint`。Expected: PASS。
- [ ] **Step 5: Commit** `feat(api): meal endpoints and real intake in today summary`

---

### Task 5: LIFF 飲食卡片與「修改這一餐」頁

**Files:**

- Create:
  - `apps/liff/src/pages/meal/MealEdit.tsx`
  - `apps/liff/src/pages/meal/MealEdit.test.tsx`
  - `apps/liff/src/pages/meal/FoodSearch.tsx`
  - `apps/liff/src/pages/meal/FoodSearch.test.tsx`
  - `apps/liff/src/pages/meal/MealsCard.tsx`
  - `apps/liff/src/pages/meal/MealsCard.test.tsx`
- Modify:
  - `apps/liff/src/router.ts`（新增路由 `"meal"`）
  - `apps/liff/src/App.tsx`
  - `apps/liff/src/pages/Records.tsx`（拿掉「即將推出」的飲食按鈕，改放 `MealsCard`）
  - `apps/liff/src/pages/Records.test.tsx`
  - `apps/liff/src/router.test.ts`
  - `apps/liff/src/theme.ts`（只在需要新的 class 時）

**Interfaces:**

- Consumes: Task 4 的 API；Task 1 的型別、`MEAL_TYPE_LABELS`、`defaultMealType`、`isValidGrams`、`GRAMS_LIMITS`；`apiFetch`。
- Produces:
  - 路由 `/meal?id=<uuid>`：修改既有餐點。
  - 路由 `/meal?type=<MealType>`：新增今天的一餐。沒有 `type` 時，用 `defaultMealType(台北現在幾點)`。
- 畫面依設計稿 `Liff-MealEdit`：
  - 日期、標題「修改這一餐」（新增時是「記錄一餐」）。
  - 餐別膠囊按鈕 4 個。
  - 每個品項一張卡片，顯示名稱、熱量與蛋白質，以及 − / 克數輸入框 / ＋ / 刪除。−、＋ 每次 10 g，並受 1–2000 限制。
  - 「新增或換成其他食物」搜尋框：輸入停 300 ms 後才查詢，結果列表點一下就以 100 g 加入。
  - 結果下方顯示資料來源那一行。
  - 底部固定區塊顯示合計熱量，以及按鈕「儲存並確認」。編輯既有餐點時，另有「刪除這一餐」文字按鈕，按下後要在頁面上再確認一次，不用 `confirm()`。
  - 營養值在前端用 `nutritionFor`／`scaleNutrition` 即時預覽，存檔以 API 回傳為準。
- `MealsCard` 依設計稿 `Liff-Records` 的「飲食」卡片：
  - 「熱量 已攝取 / 目標 kcal」與進度條。目標來自既有的 profile API；沒有目標時只顯示已攝取。
  - 今天每筆餐點一行「餐別　品項名稱（最多兩個，用＋連接，更多時加『等』）　kcal ›」，點了開 `/meal?id=`。
  - 還沒記錄的餐別（早、午、晚）各一行「還沒記錄　＋ 記錄」，點了開 `/meal?type=`。

- [ ] **Step 1: 寫失敗的測試**（照 `pages/workout/testHelpers.ts` mock `apiFetch` 的方式）
  - `router.test.ts`：`/meal` 對應 `"meal"`。
  - `MealsCard`：
    - 有一筆午餐時，顯示「午餐」、品項名稱和 kcal，連結是 `/meal?id=…`。
    - 早餐和晚餐顯示「＋ 記錄」，連結含 `type=breakfast`、`type=dinner`。
  - `FoodSearch`：
    - 輸入「白飯」，300 ms 內不呼叫 API；300 ms 後呼叫 `/foods?q=%E7%99%BD%E9%A3%AF`（有編碼）。
    - 點結果會呼叫 `onPick(food)`。
    - 資料來源文字有出現。
  - `MealEdit`：
    - 新增模式：選一個食物後合計熱量更新；按「儲存並確認」送出 `POST /meals`，body 的 `items[0].grams` 是 100。
    - 編輯模式：把 180 改成 90，送出 `PUT`，該品項是 `{ id, grams: 90 }`。
    - 克數輸入 0 或 2001 時，「儲存並確認」停用，並顯示「克數要在 1–2000 之間」。
    - 刪除這一餐：要按兩次（第二次是頁面上的確認按鈕）才送 `DELETE`。
    - API 回 404 時顯示「找不到這一餐」，並提供回「我的紀錄」的連結。
  - `Records.test.tsx`：不再出現「即將推出」的飲食按鈕。
- [ ] **Step 2:** `npm test -w @gac/liff`。Expected: FAIL。
- [ ] **Step 3:** 實作元件與路由。
- [ ] **Step 4:** `npm test -w @gac/liff`、`npm run typecheck`、`npm run lint`、`npm run build -w @gac/liff`。Expected: PASS。
- [ ] **Step 5:** 用本機 dev server 在 320px、淺色與深色各截一張圖，存到工作區，附在報告裡。
- [ ] **Step 6: Commit** `feat(liff): meal logging with food search`
