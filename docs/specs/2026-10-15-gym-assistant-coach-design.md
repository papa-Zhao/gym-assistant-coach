# Gym Assistant Coach — 設計規格 v0.1

- 日期：2026-10-15
- 狀態：已核准（2026-10-15）
- 範圍：整體架構 + 第 1 期詳細規格；第 2–4 期為概要

---

## 1. 產品概述

Gym Assistant Coach 是一個透過 **LINE 官方帳號** 使用的健身助理，公開給任何人加好友使用。

- 使用者在 LINE 聊天室中快速記錄訓練、拍照記錄飲食、詢問 AI 菜單與飲食建議。
- 較複雜的操作（表單、趨勢圖、歷史紀錄）在 **LIFF**（LINE 內開啟的網頁）完成。
- 之後加入教練模式、約課、附近餐廳 AI 推薦。

### 目標
1. 讓「記錄」的摩擦降到最低（拍照、自然語言、一鍵複製）。
2. AI 建議根據使用者真實資料，而非泛用回答。
3. 低成本營運：閒置時接近零成本。

### 非目標（目前不做）
- 原生 App、Apple Health / Google Fit 同步
- 線上金流（第 4 期）
- 醫療等級的營養或復健建議

---

## 2. 已確定的決策

| 項目 | 決定 |
|---|---|
| 使用對象 | 公開，任何人可加好友使用 |
| 前端 | React（LIFF），Vite + TypeScript |
| 後端 API | Node.js + TypeScript |
| LINE Bot | Python |
| 資料庫 | Neon Postgres 免費方案（標準 Postgres，之後可 `pg_dump` 搬家） |
| 照片 | 上傳前壓縮至約 1024px JPEG、存在 Google Cloud Storage、90 天自動刪除，DB 只存物件 key |
| AI | Claude API，第一版全部使用 **Claude Haiku 5.5**（`claude-haiku-5-5`） |
| 部署 | Google Cloud Run（API、Bot）；LIFF 靜態網站另行託管 |
| 教練模式 | 第 2 期，含約課；**先免費**，不抽成、不收月費 |
| 與 StatMate 關係 | 完全獨立的專案，不共用程式碼、帳號或基礎設施 |

---

## 3. 系統架構

```
LINE App ──webhook──► bot（Python, Cloud Run）──內部 API──►┐
   │                   驗簽、解析事件、組 Flex 訊息         │
   │                                                       ▼
   └──開啟 LIFF──► liff（React, 靜態託管）──HTTPS──► api（Node, Cloud Run）
                                                          │
                                         ┌────────────────┼──────────────────┐
                                         ▼                ▼                  ▼
                                   Neon Postgres     物件儲存（照片）   Claude API
                                                                    （第 3 期：Google Places）
```

### 3.1 各服務職責

| 服務 | 職責 | 不做的事 |
|---|---|---|
| `bot`（Python） | 驗證 `X-Line-Signature`、解析 LINE 事件、下載使用者傳的圖片、呼叫 `api`、把結果組成 Flex / Quick Reply 回覆、管理 Rich Menu | **不直接連資料庫、不直接呼叫 AI** |
| `api`（Node） | 唯一的資料庫與 AI 存取者；商業邏輯、權限、AI 次數上限與成本紀錄、照片處理與上傳 | 不處理 LINE webhook 格式 |
| `liff`（React） | LIFF 網頁：表單、趨勢圖、歷史紀錄、修改 AI 辨識結果 | 不存任何機密 |

**理由**：LIFF 與聊天室都需要 AI 和資料；集中在 `api` 只需實作一次權限、上限與紀錄，也避免兩個服務同時寫資料庫。

### 3.2 服務間驗證
- `bot` → `api` 的內部端點（`/internal/*`）：`bot` 用自己的 Google 服務帳號向 metadata server 取得 **Google ID token**，`api` 驗證簽章、audience 與服務帳號 email。不使用固定的共用密碼。
- `liff` → `api` 的公開端點：見 §4。

### 3.3 Cloud Run 注意事項
- **min instances = 0**（閒置不收費），接受冷啟動約 1–3 秒。
- Cloud Run 預設只在處理請求期間分配 CPU：**回應送出後不能再做背景工作**。`bot` 必須在 webhook 請求內完成處理並回覆 LINE 後才回應 200。
  - 先顯示 LINE 的「載入中」動畫，再處理。Haiku 回應通常在數秒內，預期可在 reply token 有效期內完成。
  - 若實測發生逾時，再改為 Cloud Tasks 佇列處理，並以 push 訊息補送（會消耗 push 額度）。
- 區域：建議 Cloud Run 放在 `asia-southeast1`（新加坡），與 Neon 的 `aws-ap-southeast-1` 相近，減少每次查詢的延遲（實際區域在 PR 2 再確認）。

---

## 4. 身分與帳號

- 使用者不需註冊，以 **LINE userId** 為身分。
- **聊天室**：webhook 事件帶有 `source.userId`，`bot` 傳給 `api`，`api` 以 `line_user_id` 找到或建立使用者。
- **LIFF**：`liff.getIDToken()` → `api` 呼叫 LINE 的 ID token 驗證端點確認 → 發給 LIFF 一個短效 access token（例如 1 小時，存在記憶體）。過期就重新走 LIFF 登入，使用者無感。
- **首次使用流程**（加好友後）：
  1. 歡迎訊息 + 服務條款 / 隱私權政策連結
  2. 同意後才開放功能；同意紀錄（版本、時間）寫入 `consents`
  3. 年齡確認：MVP 限 **18 歲以上**（見 §12 待決事項）
  4. 引導填寫個人檔案（LIFF）

---

## 5. 資料模型（第 1 期）

主鍵一律 `uuid`，時間一律 `timestamptz`，「哪一天」的欄位以 **Asia/Taipei** 日期儲存為 `date`。

| 表 | 主要欄位 | 說明 |
|---|---|---|
| `users` | id, line_user_id (unique), display_name, role (`user`/`coach`/`admin`), status, created_at, deleted_at | |
| `consents` | user_id, doc (`terms`/`privacy`), version, agreed_at | |
| `user_profiles` | user_id, sex, birth_year, height_cm, activity_level, goal (`cut`/`maintain`/`bulk`), target_kcal, target_protein_g, target_carb_g, target_fat_g, targets_overridden | 目標值由 BMR（Mifflin-St Jeor）× 活動係數 ± 目標調整計算；使用者可手動覆寫 |
| `body_metrics` | user_id, measured_on, weight_kg, body_fat_pct, waist_cm | 每人每天一筆（upsert） |
| `exercises` | id, name_zh, name_en, muscle_group, equipment, is_custom, owner_user_id | 種子資料 + 使用者自訂 |
| `workout_sessions` | id, user_id, performed_on, started_at, ended_at, note, template_id | |
| `workout_sets` | session_id, exercise_id, set_index, reps, weight_kg, rpe | |
| `workout_templates` / `template_items` | 範本名稱；動作、預設組數、次數 | AI 產生的課表也存成範本 |
| `foods` | id, source (`tfda`/`custom`/`ai`), name, per_100g kcal/protein/carb/fat, serving_desc | 食藥署資料一次匯入 |
| `meals` | id, user_id, eaten_on, meal_type (`breakfast`/`lunch`/`dinner`/`snack`), status (`draft`/`confirmed`), source (`photo`/`text`/`manual`/`copy`) | AI 辨識結果先存成 `draft` |
| `meal_items` | meal_id, food_id (nullable), name, grams, kcal, protein_g, carb_g, fat_g, ai_confidence | 營養值存在這裡，之後修改 `foods` 不影響歷史紀錄 |
| `meal_photos` | meal_id, object_key, expires_at | 90 天後由儲存生命週期刪除 |
| `daily_summaries` | user_id, day, kcal, protein_g, carb_g, fat_g, workout_volume | 寫入時更新，畫趨勢圖用 |
| `ai_conversations` / `ai_messages` | 對話與訊息；token 用量 | |
| `ai_usage_daily` | user_id, day, kind (`photo`/`chat`), count, input_tokens, output_tokens | 次數上限與成本追蹤 |

---

## 6. 第 1 期功能規格

### 6.1 Rich Menu（6 格）
| 記訓練 | 拍餐點 | 問 AI |
|---|---|---|
| **今日總覽** | **我的紀錄（LIFF）** | **設定（LIFF）** |

- 「拍餐點」：開啟相機 / 相簿（LINE quick reply 的 camera / cameraRoll action）。
- 「記訓練」：開啟 LIFF 訓練頁面。

### 6.2 個人檔案與目標
- LIFF 表單：性別、出生年、身高、體重、活動量、目標。
- 送出後顯示建議的每日熱量與營養素目標，可手動調整。
- **安全下限**：建議熱量不低於 BMR，且不低於 1,200 kcal（女）/ 1,500 kcal（男）；手動覆寫低於下限時顯示警告。

### 6.3 身體數據
- 在聊天室輸入「體重 72.5」即可記錄，回覆與上次的差異。
- LIFF：體重、體脂、腰圍的 7 / 30 / 90 天趨勢圖（以 7 日移動平均平滑）。

### 6.4 訓練紀錄（LIFF）
- 開始訓練 → 選範本或空白 → 加入動作 → 記錄每組次數、重量、RPE。
- 每個動作自動帶出「上次做這個動作的組數與重量」，並提示漸進式超負荷（例如上次全部組數都達到目標次數 → 建議 +2.5 kg）。
- 個人最佳紀錄（以估算 1RM 計算）達成時，於聊天室推送恭喜訊息（使用 reply 時機，不額外消耗 push）。
- 每週每個肌群的組數統計。

### 6.5 拍照記錄飲食（核心流程）
1. 使用者在聊天室傳送照片。
2. `bot` 先顯示載入動畫，從 LINE content API 下載圖片，呼叫 `api` 的 `POST /internal/meals/photo`。
3. `api`：
   - 檢查當日照片辨識上限
   - 用 `sharp` 縮到長邊 1024px、轉 JPEG、**移除 EXIF（含 GPS）**
   - 上傳到物件儲存
   - 呼叫 Haiku 5.5，以 **structured output** 取得 `items[]`：名稱、估計克數、熱量、蛋白質、碳水、脂肪、信心值
   - 若無法辨識為食物，回傳原因
4. `api` 存成 `draft` 的餐點，依當下時間預設餐別。
5. `bot` 回覆 Flex 卡片，內容為各項食物與總熱量 / 蛋白質，並附三個按鈕：
   - **✅ 確認**：轉為 `confirmed`
   - **✏️ 修改**：開啟 LIFF 修改份量或品項，可從 `foods` 搜尋替換
   - **🍽 換餐別**
6. 確認後回覆「今日已攝取 / 剩餘」。
7. 超過 24 小時仍是 `draft` 的餐點，不計入每日統計。

也支援文字記錄：「午餐 雞腿便當 無糖豆漿」，由 AI 解析成同樣的 `items[]` 結構，走同樣的確認流程。

### 6.6 問 AI（菜單與飲食建議）
- 入口：聊天室直接打字（非指令的文字視為問 AI），或 Rich Menu「問 AI」顯示常見問題的 quick reply（「今天練什麼」「晚餐吃什麼」「幫我排一週課表」）。
- `api` 組裝上下文：個人檔案與目標、近 7 天訓練摘要、近 7 天飲食達成率、今日剩餘熱量與營養素、最近 10 則對話。
- 課表類回答以 structured output 回傳，可「一鍵存成訓練範本」。
- **安全規則**（寫在系統提示，另由程式檢查）：
  - 不建議低於安全下限的熱量
  - 提到受傷、疼痛、疾病、懷孕、飲食疾患時，建議諮詢醫師或專業人員，不給具體處方
  - 每則建議附簡短免責聲明（Flex 卡片頁尾）

### 6.7 今日總覽
- Flex 卡片：熱量與營養素進度條、今日訓練、體重、連續記錄天數。

### 6.8 資料權利（上線前必備）
- LIFF 設定頁：**匯出我的資料**（JSON / CSV）、**刪除我的所有資料**。
- 刪除採「立即停用 + 7 天內實際刪除」：包含照片物件；保留去識別化的 AI 用量統計。
- 使用者封鎖官方帳號（unfollow 事件）時不刪資料，只標記；隱私權政策說明保存期限。

---

## 7. AI 設計

| 項目 | 設定 |
|---|---|
| 模型 | `claude-haiku-5-5`（集中在一個設定值，之後可依功能改模型） |
| SDK | `@anthropic-ai/sdk`（只在 `api` 中使用） |
| 輸出格式 | 照片辨識、文字飲食解析、課表都用 structured output（JSON schema）；一般建議用純文字 |
| 思考深度 | 依功能設定 `effort`：辨識與解析用 `low`，建議與課表用 `medium`，上線後再調 |
| 快取 | 系統提示（含規則與 few-shot 範例）放在最前面並啟用 prompt caching；使用者資料放在後面 |
| 拒答 | 處理 `stop_reason: "refusal"`，回覆通用的婉拒訊息。Haiku 沒有伺服器端備援，不設 fallback |
| 每日上限（初始值） | 照片辨識 10 次、文字解析 20 次、問 AI 20 次；超過時回覆明天再試 |
| 紀錄 | 每次呼叫記錄 input / output / 快取 token 與耗時；**不記錄照片內容，也不把對話內容寫進 log** |
| 品質評估 | 準備 30–50 張台灣常見餐點照（便當、自助餐、超商、手搖飲）與人工標註，作為回歸測試，未來換模型時也用來比較 |

估算成本（Haiku 5.5，粗估）：一個活躍使用者（每天 3 張照片 + 2 次提問）每月約 US$0.2。

---

## 8. 非功能需求

### 8.1 安全
- LINE webhook 驗簽；拒絕驗簽失敗的請求。
- 所有 `api` 查詢都以「目前使用者」限制範圍；權限在 `api` 統一檢查（第 2 期的教練權限也在這裡）。
- 照片存取一律透過短效簽名網址（約 5 分鐘）；儲存桶不公開。
- 機密（LINE channel secret / access token、Anthropic API key、Neon 連線字串、儲存金鑰）放在 Google Secret Manager。
- 依使用者與 IP 限流。

### 8.2 隱私
- 隱私權政策需寫明：蒐集項目（身體數據、飲食、照片）、目的、保存期限、**照片與飲食資料會傳送給 AI 服務供應商（Anthropic）處理**、使用者權利。
- 上線前建議由法律專業人士審閱。

### 8.3 成本控制
- Cloud Run min instances 0；Neon 免費方案（閒置自動休眠）。
- LINE 官方帳號免費方案的 push 額度很少 → 第 1 期**不做主動推播**，所有回覆都使用 reply。
- 設定 Google Cloud 預算警示（例如每月 US$10、US$30）與 Anthropic 用量上限。

### 8.4 可觀測性
- 結構化 JSON log（Cloud Logging），不含個資內容。
- `/health` 端點；Cloud Monitoring 監控錯誤率與延遲。

---

## 9. Repo 結構（建議）

```
gym-assistant-coach/
├── apps/
│   ├── api/        # Node 24 + TypeScript + Fastify + Drizzle ORM
│   ├── bot/        # Python 3.12 + FastAPI + line-bot-sdk
│   └── liff/       # React + Vite + TypeScript + @line/liff
├── packages/
│   └── shared/     # api 與 liff 共用的型別與 schema（TypeScript，只含原始碼）
├── db/             # migrations、種子資料（動作庫、食藥署營養資料）
├── infra/          # GCP 設定腳本或 Terraform
├── docs/
│   └── specs/
└── .github/workflows/
```

- CI/CD：GitHub Actions → 以 Workload Identity Federation（不放長期金鑰）登入 GCP → build image → Artifact Registry → deploy Cloud Run。
- Migrations 在部署前由 CI 執行，並先建立 Neon branch 作為備份點。

---

## 10. 第 1 期 PR 順序

每個 PR 都等你審閱、確認後再合併。

| PR | 內容 | 完成條件 |
|---|---|---|
| 1 | Monorepo 骨架、lint / test / typecheck CI | CI 綠燈 |
| 2 | GCP 專案、Artifact Registry、Secret Manager、兩個 Cloud Run 服務（hello）、WIF 部署、Neon 專案與 migration 流程、GCS 儲存桶與生命週期規則、預算警示 | push main 後自動部署，`/health` 正常 |
| D | **UI 設計階段**（與 PR 1–2 並行，見 §10.1） | 你核准設計稿 |
| 3 | LINE channel 設定、`bot` webhook 驗簽、`api` 內部驗證、`users` / `consents`、首次使用與同意流程、LIFF 登入、條款與隱私頁草稿 | 加好友 → 同意 → 開啟 LIFF 能顯示自己的名字 |
| 4 | 個人檔案與目標計算、Rich Menu、今日總覽（空資料） | 填完檔案後總覽顯示目標 |
| 5 | 身體數據（聊天室指令 + LIFF 趨勢圖） | 能記錄體重並看到圖 |
| 6 | 動作庫種子資料、訓練紀錄、範本、上次重量、PR 偵測 | 完整記錄一次訓練 |
| 7 | 食藥署營養資料匯入、手動 / 文字（AI 解析）飲食記錄、確認流程、每日彙總 | 文字記一餐並在總覽看到 |
| 8 | 拍照記錄飲食（壓縮、去 EXIF、上傳、Haiku 辨識、Flex 確認、LIFF 修改、次數上限）+ 餐點照片評估集 | 傳照片 → 確認 → 計入今日 |
| 9 | 問 AI（上下文組裝、安全規則、課表存成範本、次數上限） | 「幫我排一週課表」可存成範本 |
| 10 | 上線前加固：匯出 / 刪除資料、限流、監控與警示、隱私權政策定稿、負載與成本檢查 | 可公開上線 |

### 10.1 UI 設計階段（D）

PR 1–2 不涉及畫面，所以設計與它們同時進行；**PR 3 開始做畫面之前必須核准**。

1. **風格方向**：提供 2–3 個方向（色彩、字體、語氣），附範例畫面，由你挑選。
2. **設計 token**：顏色、字級、間距、圓角、深色模式，寫進 `packages/shared` 讓 LIFF 共用。
3. **可點擊的設計稿**：
   - Rich Menu 圖片（2500×1686）
   - Flex 卡片：餐點辨識結果、今日總覽、AI 建議、課表
   - LIFF 主要頁面：首次設定、個人檔案、訓練進行中、飲食修改、趨勢圖、設定
4. **Logo 與官方帳號頭像**（可先用簡單的文字標誌）。

之後每個功能 PR 依照核准的設計稿實作；若實作時發現需要調整，在該 PR 中提出並由你確認。第 2 期（教練、約課）的畫面在第 2 期開始前另外設計。

---

## 11. 後續階段概要

### 第 2 期：教練與約課（免費）
- **教練申請**：上傳證照照片 → 管理員在後台審核（`coach_profiles.status`：`pending` / `approved` / `rejected`）。
- **教練頁面**：簡介、專長、上課地點、可預約時段。
- **時段**：每週規則 + 例外日（`availability_rules`、`availability_exceptions`）。
- **預約**：`bookings` 用 Postgres exclusion constraint（`btree_gist` + `tstzrange`）在資料庫層防止同一教練的時段重疊。
- **取消政策**：上課前 24 小時內不可取消（可設定）。
- **學員授權**：學員授權後，教練才能看他的訓練與飲食數據；可隨時撤回（`coach_student_links.data_share_granted_at` / `revoked_at`），並保留存取紀錄。
- **教練功能**：指派課表給學員、留言。
- **提醒**：上課前提醒會用到 push 訊息 → 屆時評估 LINE 方案費用。
- 簡易管理後台（審核教練、處理檢舉）。

### 第 3 期：附近餐廳 + AI 推薦
- 使用者傳送 LINE 位置訊息（或在 LIFF 授權定位）→ Google Places Nearby Search → 依今日剩餘營養素，由 AI 推薦店家與點餐方式。
- Places 沒有菜單資料 → 提供「拍菜單 → AI 從菜單挑選」（沿用視覺辨識）。
- 依區域與類別快取 Places 結果 1–7 天（`places_cache`），並遵守 Google 的快取條款。

### 第 4 期：金流與營運
- 金流（需公司或行號登記）、教練收費模式、檢舉流程、數據分析。

---

## 12. 已決事項（2026-10-15 使用者同意全部採用建議）

| # | 問題 | 決定 |
|---|---|---|
| 1 | 年齡限制 | MVP 限 18 歲以上 |
| 2 | 照片儲存 | **Google Cloud Storage**（取代 R2）：使用服務帳號權限、不需管理金鑰 |
| 3 | LIFF 前端託管 | Cloudflare Pages 或 Firebase Hosting，PR 2 時二選一 |
| 4 | 網域 | 第 1 期用託管服務的預設網域；正式上線前購買 |
| 5 | LINE 官方帳號方案 | 免費方案；第 2 期有推播需求時再評估 |
| 6 | AI 每日上限 | 依 §7 初始值，上線後調整 |
| 7 | GitHub repo | `papa-Zhao/gym-assistant-coach`（私人） |
| 8 | 區域 | 新加坡（Cloud Run `asia-southeast1`、Neon `aws-ap-southeast-1`），PR 2 實測延遲後確認 |
