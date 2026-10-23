# 負載測試（假 AI）

目標：確認同時 20 個使用者時，api 的延遲、錯誤率、連線數和冷啟動都在可接受範圍內。

- **只測 api**，不測 bot webhook（bot 會呼叫 LINE 的 reply API）。bot 打到 api 的路徑（`/internal/*`）由 k6 直接模擬。
- **假 AI**：`apps/api/src/loadtest-server.ts` 用 `apps/api/src/loadtest/fakes.ts` 取代 Anthropic、照片儲存、LINE 驗證、服務帳號驗證和 bot 通知；AI 固定回傳並等 `FAKE_AI_DELAY_MS`（預設 2,000 ms）。**資料庫是真的**（Neon 測試分支）。
- **絕對不能**用正式的 `ANTHROPIC_API_KEY`、正式資料庫或正式的 `SESSION_SECRET`。`loadtest-server` 在 `K_SERVICE=api` 時拒絕啟動。
- 測試服務是暫時的 `api-loadtest`（同一個 image，改啟動指令），**不是** api 服務的 tagged revision：`gcloud run deploy api --tag … --command …` 會改到 api 服務本身的設定，下一次 CI 部署會沿用假 AI 的啟動指令。
- `api-loadtest` 是公開 URL，安全性靠假驗證只接受隨機產生的 `LOADTEST_INTERNAL_TOKEN` 和 `loadtest:` 開頭的 token，而且只連測試分支。**測完當天就刪掉。**

## 門檻（寫在 `loadtest/api.js`，k6 跑完直接顯示通過或失敗）

| 項目 | 門檻 |
|---|---|
| 非 AI 請求 p95（`http_req_duration{ai:false}`） | < 800 ms |
| AI 請求 p95（`http_req_duration{ai:true}`，假 AI 延遲 2,000 ms） | < 3,500 ms |
| 錯誤率（`http_req_failed{expected_limit:false}`，不含刻意觸發的上限） | < 1% |
| 不該出現的 AI 回覆（`unexpected_outcomes`，例如 steady 情境撞到每日上限） | 0 |

## 腳本做什麼（`loadtest/api.js`）

- `setup()`：建立 `USERS`（預設 200）＋ 1 個假使用者，每個人走真的流程：`POST /internal/users/sync` → `POST /internal/users/consent` → `POST /auth/liff`（`idToken: "loadtest:<LINE ID>"`）→ `PUT /profile`。LINE ID 是 `U10ad` ＋ `RUN`（4 個 hex，每次執行不同）＋ 編號，所以每次執行都是新使用者、AI 每日次數從 0 開始。
- 情境 `steady`：20 個 VU 跑 `STEADY_SECONDS`（預設 300 秒）。每次迭代換下一個使用者，依序打：
  - `POST /internal/users/today`（bot 的今日總覽）
  - `GET /workouts/week`
  - `PUT /body-metrics/today`（體重）
  - `POST /internal/meals/text`（AI）
  - `POST /internal/ai/ask`（AI）
  - 30% 的迭代多做 `POST /internal/meals/photo`（`loadtest/fixtures/meal.jpg`，約 94 KB，會跑 sharp 壓縮；AI）
  - 10% 的迭代做一次完整訓練：`POST /workouts` → `POST /workouts/:id/items` → `PUT /workouts/:id/sets` → `POST /workouts/:id/finish`
  - 結束後等 3–5 秒。5 分鐘約 1,500 次迭代 ÷ 200 人 ≈ 每人 8 次，低於每日上限（照片 10、文字 20、問 AI 20）。
- 情境 `limits`：`steady` 結束後 30 秒開始，1 個 VU。保留的使用者連打 25 次 `POST /internal/meals/text`，第 21 次起應該回 `outcome: "limit"`（或 429），計入 `expected_limits`，不算錯誤。
- 限流：k6 從同一個 IP 打。`/internal/*` 不受 api 的限流；`/auth/liff` 是用 IP 計數（正式上限每分鐘 30 次），所以 `loadtest-server` 讀 `RATE_LIMIT_IP_MAX`（預設 100,000）調高 IP 上限。每個使用者每分鐘 120 次的上限不變，輪流換人不會撞到。

## 執行步驟

前提：本 PR 已合併、CI 已把含 `dist/loadtest-server.js` 的 api image 推到 Artifact Registry。需要本機的 `gcloud` 登入（專案 Owner）、Neon 主控台、[k6](https://k6.io)（本機安裝的單一執行檔，例如 `brew install k6`）。以下指令在 repo 根目錄執行。

### 1. 建 Neon 測試分支並跑 migration

1. Neon 主控台 → 正式專案 → Branches → **New branch**，從 `main` 建分支，名稱 `loadtest-YYYYMMDD`。
2. 在這個分支的 **Connect** 對話框勾選 **Connection pooling**，複製 **pooled** 連線字串（主機名稱有 `-pooler`）。3 個 instance × pool `max: 5` = 15 條連線，要走 pooler。
3. 在終端機輸入（不會顯示，也不會進指令歷史）：

   ```sh
   read -rs LT_DB && export LT_DB   # 貼上測試分支的 pooled 連線字串，按 Enter
   DATABASE_URL="$LT_DB" npm run db:migrate -w @gac/api
   ```

4. 記下建立當下的資料量（第 6 步要比較）：在 Neon SQL editor 選 **測試分支**，執行

   ```sql
   select pg_size_pretty(pg_database_size(current_database())), pg_database_size(current_database());
   ```

### 2. 產生測試用的機密

```sh
LT_SECRET="$(openssl rand -base64 48)"
LT_TOKEN="$(openssl rand -base64 48 | tr -d '/+=' )"
export LT_SECRET LT_TOKEN
```

這兩個值只在這次測試用，不寫進檔案、不重複使用。`LT_TOKEN` 去掉 `/+=`，避免 k6 的 `-e` 參數或 HTTP header 出問題（長度仍超過 32 bytes）。

### 3. 部署 `api-loadtest`

```sh
REGION=asia-southeast1
# 目前正式 api 服務用的 image（CI 部署的那個，tag 是 commit SHA）
IMAGE="$(gcloud run services describe api --region "$REGION" --format='value(spec.template.spec.containers[0].image)')"
echo "$IMAGE"   # 確認 tag 是含本 PR 的 main commit

gcloud run deploy api-loadtest \
  --image "$IMAGE" \
  --region "$REGION" \
  --command node --args dist/loadtest-server.js \
  --cpu 1 --memory 512Mi --min-instances 0 --max-instances 3 \
  --allow-unauthenticated \
  --set-env-vars "DATABASE_URL=$LT_DB,SESSION_SECRET=$LT_SECRET,LOADTEST_INTERNAL_TOKEN=$LT_TOKEN,CORS_ORIGIN=https://loadtest.invalid,RATE_LIMIT_IP_MAX=100000,FAKE_AI_DELAY_MS=2000"

LT_URL="$(gcloud run services describe api-loadtest --region "$REGION" --format='value(status.url)')"
```

- cpu、memory、instance 數和 `infra/run.tf` 的 api 相同（`cpu = "1"`、`512Mi`、`max_instance_count = 3`、`min_instance_count = 0`）。
- 不指定 `--service-account`：假服務不呼叫任何 GCP API。
- 部署後在 Cloud Logging 應該看到一行 `LOADTEST SERVER: fake AI, do not route production traffic`。

### 4. 量冷啟動

讓服務閒置 15 分鐘以上（縮到 0 個 instance）後：

```sh
curl -s -o /dev/null -w 'health %{time_total}s\n' "$LT_URL/health"
curl -s -o /dev/null -w 'db %{time_total}s\n' -X POST "$LT_URL/internal/users/sync" \
  -H "Authorization: Bearer $LT_TOKEN" -H 'Content-Type: application/json' \
  -d '{"lineUserId":"U10adffff000000000000000000000000"}'
```

第一行是冷啟動，第二行是緊接著的第一個資料庫請求（Neon 測試分支也可能剛從休眠醒來）。兩個時間都記到「結果」。

### 5. 跑 k6

```sh
k6 run -e BASE_URL="$LT_URL" -e INTERNAL_TOKEN="$LT_TOKEN" loadtest/api.js 2>&1 | tee /tmp/k6-loadtest.txt
```

- 約 7 分鐘（`setup` 建 201 個使用者約 1–2 分鐘、`steady` 5 分鐘、`limits` 幾秒）。
- 想先試跑：加 `-e USERS=5 -e STEADY_SECONDS=30`。
- 跑的時候在 Neon SQL editor（測試分支）看連線數：`select count(*) from pg_stat_activity;`
- 跑完查有沒有連線數爆掉：

  ```sh
  gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="api-loadtest" AND (textPayload:"too many connections" OR jsonPayload.msg:"too many connections" OR severity>=ERROR)' \
    --freshness=1h --limit=50 --format='value(timestamp,severity,jsonPayload.msg,textPayload)'
  ```

- 最多開了幾個 instance：Cloud Console → Cloud Run → `api-loadtest` → **Metrics** → **Container instance count**（或 Cloud Monitoring 的 `run.googleapis.com/container/instance_count`）。

### 6. 量資料量

在 Neon SQL editor（測試分支）再執行一次第 1 步的查詢，和建立分支時的 `pg_database_size` 相減，除以（k6 摘要的迭代數），得到每次迭代的資料量；再除以人數得到每人的資料量，給 `docs/launch/cost-estimate.md` 推算一年後的大小。

### 7. 清理（當天一定要做）

```sh
gcloud run services delete api-loadtest --region asia-southeast1 --quiet
gcloud run services list --region asia-southeast1   # 只剩 api、bot
unset LT_DB LT_SECRET LT_TOKEN
```

Neon 主控台 → Branches → `loadtest-YYYYMMDD` → **Delete**，確認列表裡已經沒有這個分支。

## 結果

> **尚未執行。** 本 PR 只寫好腳本與步驟，沒有在雲端跑過（腳本也還沒在本機用 k6 跑過：實作環境沒有 k6）。使用者照上面的步驟執行後，把結果填在下面，並更新 `docs/launch/cost-estimate.md` 的 Neon 資料量。

要填的項目：

- 執行日期、image（commit SHA）、`RUN` 值
- k6 摘要：各門檻通過與否；`ai:false` 與 `ai:true` 的 p50／p95；`http_req_failed` 的比率與筆數；`expected_limits` 筆數；`unexpected_outcomes` 筆數；總迭代數
- 照片記餐（`POST /internal/meals/photo`）單獨的 p95（k6 摘要沒有分開時，用 `--summary-trend-stats` 或 `name` tag 看）
- 冷啟動：`/health` 與第一個資料庫請求的時間
- Cloud Run 最多同時開了幾個 instance
- 有沒有 `too many connections` 或其他 ERROR；測試中最多幾條資料庫連線
- 資料量：每次迭代、每人
- 門檻沒過的話：原因與建議（例如調 `max_instance_count` 或 pool 大小）。**不在本 PR 改設定**，列進 `docs/launch/checklist.md` 請使用者決定。
