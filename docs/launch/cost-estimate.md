# 每月成本估算

> **暫定版（2026-10-23）。** 兩類數字還沒定案，表格裡標了「暫定」：
>
> 1. **AI token 數**：還沒拿到正式環境的實際平均值，暫用下面「暫定 token」的假設值。請在 Neon 跑「待執行的查詢」後，把結果填進「AI 每次呼叫」表格，重算 AI 那一列。
> 2. **Neon 資料量**：要等 `docs/launch/load-test.md` 量到每人資料量後再算。
>
> 價格都是 2026-10-23 查的，每一項附來源。沒能在官方頁面確認的數字標「未確認」。

## 使用模型

- 活躍使用者每天：3 張照片（餐點或器材）、2 次文字記餐、2 次問 AI、0.5 次訓練完成通知（LINE push）、打開 LIFF 與其他請求約 25 次。
- 每張照片約 150 KB（壓縮後）。
- 每月 30 天。匯率暫用 **US$1 ≈ NT$32**。
- 兩個情境：**200 人**（上線後前 3 個月的估計）和 **1,000 人**。

## 價格（2026-10-23 查詢）

| 項目 | 價格 | 來源 |
|---|---|---|
| Anthropic `claude-haiku-5-5`（prompt ≤ 100K tokens） | input US$0.10／MTok；output US$0.50／MTok；cache read US$0.01／MTok；5 分鐘 cache write US$0.125／MTok | <https://platform.claude.com/docs/en/about-claude/pricing> |
| Cloud Run（`asia-southeast1`，request-based） | **未確認**：Singapore 應是 Tier 2，US$0.0000336／vCPU-秒、US$0.0000035／GiB-秒、US$0.40／百萬請求；每月免費額度以 Tier 1 金額計（180,000 vCPU-秒、360,000 GiB-秒、200 萬請求），換成 Tier 2 約 128,571 vCPU-秒、257,142 GiB-秒 | <https://cloud.google.com/run/pricing>（官方頁抓不到全文，數字來自搜尋摘要與快取頁） |
| Neon Free | 每個專案 1 GB 儲存、每月 100 CU-小時；閒置 5 分鐘自動暫停；**CU-小時用完時運算會暫停到下個計費週期** | <https://neon.com/pricing>、<https://neon.com/docs/introduction/plans> |
| Neon Launch | US$0.106／CU-小時、US$0.35／GB-月，沒有月費下限 | 同上 |
| Neon 連線 | pooler `max_client_conn=10000`；0.25 CU 的直接連線上限 104 | <https://neon.com/docs/connect/connection-pooling> |
| GCS Standard（`asia-southeast1`） | US$0.020／GB-月（**未確認**：來自繁中版價目頁）；Class A 操作約 US$0.005／千次（**未確認**） | <https://cloud.google.com/storage/pricing>、<https://cloud.google.com/storage/docs/pricing?hl=zh-tw> |
| Firebase Hosting | 免費額度 10 GB 儲存、每天 360 MB 傳輸 | <https://firebase.google.com/pricing> |
| LINE 官方帳號（台灣） | 輕用量 NT$0，每月 200 則；中用量 NT$800（**2026-11-01 起 NT$1,000**），3,000 則；高用量 NT$1,200（2026-11-01 起 NT$1,400），6,000 則，超過每則 NT$0.2。皆未稅。**未確認**：官方方案頁 404，數字來自轉述官方公告的文章 | <https://actgsys.com/zh/blog/line-bot-development-cost-guide-2026> |
| 網域（Cloudflare Registrar，`.com`） | 約 US$10.46／年（Cloudflare 不加價，數字來自比價網站） | <https://www.cloudflare.com/products/registrar/>、<https://domainoffer.net/tld/com/cloudflare> |
| Cloud Monitoring | 約 US$0.80／月（8 個警示條件，見 PR 10.2 交接備註，**未確認**） | <https://cloud.google.com/stackdriver/pricing> |

## AI 每次呼叫

### 待執行的查詢（使用者在 Neon SQL editor、正式分支執行，唯讀）

PR 10.1 之後，已刪除帳號的用量搬到不含身分的 `ai_usage_anonymous_daily`，所以兩張表要一起算：

```sql
select kind,
       sum(count) as calls,
       sum(input_tokens)::float / sum(count) as avg_in,
       sum(output_tokens)::float / sum(count) as avg_out,
       sum(cache_read_tokens)::float / sum(count) as avg_cache_read,
       sum(cache_creation_tokens)::float / sum(count) as avg_cache_write
from (
  select kind, count, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens
  from ai_usage_daily
  union all
  select kind, count, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens
  from ai_usage_anonymous_daily
) u
group by kind
order by kind;
```

- `kind`：`photo`（餐點照片和器材照片都算這個）、`text`（文字記餐）、`chat`（問 AI）。
- 某個 kind 的 `calls` 少於 20 次時，用對應 eval 腳本（`apps/api/scripts/meal-photo-eval.ts`、`meal-text-eval.ts`、`ask-eval.ts`，每題會印 token）的平均值補。
- 每次呼叫成本 = (`avg_in` × 0.10 + `avg_out` × 0.50 + `avg_cache_read` × 0.01 + `avg_cache_write` × 0.125) ÷ 1,000,000 美元。

### 暫定 token（**要被上面的查詢結果取代**）

沒有正式數據，先用下面的假設。系統提示大小參考計畫文件：問 AI 的系統提示含動作清單約 3,500 tokens（PR 9.2），照片一張約 1,200–1,500 tokens。流量稀疏時快取常過期，**假設一半命中快取、一半重新寫入**（cached 部分的平均單價 = 0.5 × 0.01 + 0.5 × 0.125 = US$0.0675／MTok）。

| kind | 未快取 input | 快取部分（系統提示） | output | 每次成本（暫定） |
|---|---|---|---|---|
| photo | 1,600 | 1,000 | 350 | US$0.000403 |
| text | 150 | 1,000 | 300 | US$0.000233 |
| chat | 1,500 | 3,500 | 800 | US$0.000786 |

每人每月 AI = 30 × (3 × photo + 2 × text + 2 × chat) = 30 × (0.001209 + 0.000466 + 0.001572) ≈ **US$0.097**（暫定）。

## 各項服務每月成本

| 項目 | 200 人 | 1,000 人 | 算法 |
|---|---|---|---|
| Anthropic（**暫定**） | US$19.5 | US$97.4 | 人數 × US$0.097 |
| Cloud Run（api + bot，上限估計） | US$12.9 | US$85.6 | 見下方 |
| Neon | US$0（Free，但會超過 CU-小時，見下方）；改 Launch 約 US$13 | Launch 約 US$19–38 | 見下方 |
| GCS（照片，90 天後穩定） | US$0.25 | US$1.26 | 見下方 |
| Firebase Hosting | US$0 | US$0 | LIFF 靜態檔，遠低於免費額度 |
| Cloud Monitoring | US$0.8 | US$0.8 | PR 10.2 的 8 個警示條件 |
| LINE 官方帳號 | NT$0（通知會停，見下方）；中用量 NT$1,000 ≈ US$31 | 高用量約 NT$3,200 ≈ US$100 | 見下方 |
| 網域 | US$0.9 | US$0.9 | US$10.46 ÷ 12 |
| **合計（Neon Free、LINE 輕用量）** | **約 US$34**（NT$1,090） | — | |
| **合計（Neon Launch、LINE 付費）** | **約 US$78**（NT$2,500） | **約 US$305–325**（NT$9,800–10,400） | |
| **每人每月** | US$0.17–0.39 | US$0.31–0.33 | |

和規格 §7「每人每月約 US$0.2」比較：**只看 AI** 是每人 US$0.097（暫定），低於 US$0.2。加上基礎設施後，200 人在不升級 Neon 和 LINE 時約 US$0.17，接近規格的估計；如果為了通知和資料庫穩定升級付費方案，每人成本會到 US$0.3–0.4，主要是 LINE 月費和 Cloud Run 等待 AI 的時間。

### Cloud Run

`cpu_idle = true` 是 request-based 計費：只算處理請求的時間。AI 請求大部分時間在等 Anthropic，所以是成本的大頭；bot 收到照片或問題時也會同步等 api 回應，**兩個服務都要算**。

- api 每人每天：3 × 6 秒（照片）+ 2 × 3 秒（文字）+ 2 × 8 秒（問 AI）+ 23 × 0.2 秒（其他）≈ 44.6 秒
- bot 每人每天：同樣等待 AI 的 40 秒 + 5 × 0.2 秒 ≈ 41 秒
- vCPU-秒 = 人數 × 30 × 85.6；GiB-秒 = vCPU-秒 × 0.5（512 MiB）
- 200 人：513,600 vCPU-秒、256,800 GiB-秒 → (513,600 − 128,571) × 0.0000336 + 0 ≈ **US$12.9**
- 1,000 人：2,568,000 vCPU-秒 → ≈ **US$85.6**（記憶體也會超過免費額度，已含）
- 請求數 200 人約 21 萬、1,000 人約 105 萬，都在 200 萬免費額度內。
- 這是**上限**：同一個 instance 同時處理的請求只算一次時間，實際會比較低。上線一個月後用 Cloud Billing 報表確認。

### Neon

- **CU-小時（重要）**：Free 每月 100 CU-小時，閒置 5 分鐘才暫停。200 人時白天幾乎不會連續 5 分鐘沒有請求，估計每天醒著 16 小時 × 0.25 CU × 30 天 ≈ **120 CU-小時，超過 100**。用完後資料庫會暫停到下個月，等於服務中斷。改 Launch：120 × 0.106 ≈ US$12.7／月。1,000 人約全天醒著，0.25–0.5 CU → 180–360 CU-小時 → US$19–38。
  - 上線後第一週在 Neon 主控台看 CU-小時用量，推算月底會不會超過；會超過就在超過前升級 Launch（列在上線清單）。
- **資料量**：Free 每個專案 1 GB。每人每天的資料量等負載測試量到後填入：
  - 一年後大小 ≈ 目前大小 + 人數 × 365 × 每人每天資料量。照片不在資料庫裡，AI 對話與課表 90 天後刪除。
  - **暫定**：假設每人每天 10 KB（餐點、品項、訓練、AI 對話含索引），200 人一年約 0.73 GB，**約一年內接近 1 GB**；1,000 人約 2.5 個月就會超過，要用 Launch（US$0.35／GB-月）。
- **連線**：pooled 連線字串最多 10,000 個 client；3 個 instance × pool 5 = 15 條，遠低於上限。

### GCS（照片）

- 照片量（90 天後穩定）= 人數 × 3 × 90 × 150 KB：200 人 8.1 GB、1,000 人 40.5 GB。
- 儲存：8.1 × 0.020 = US$0.16；40.5 × 0.020 = US$0.81。
- 上傳（Class A）：人數 × 3 × 30 次 × US$0.005／千次 = US$0.09 ／ US$0.45。讀取（簽名網址）次數少，可忽略。
- 註：器材照片不存 GCS，這裡用 3 張全算餐點照片，是上限。

### LINE push（訓練完成通知）

- 每月 push 則數 = 人數 × 0.5 × 30：200 人 **3,000 則**、1,000 人 **15,000 則**。其他訊息都用 reply，不算則數。
- 免費方案每月只有 200 則，**約 13 個活躍使用者就會用完**。用完後訓練完成通知會停掉（規格 §8.3 已接受），其他功能不受影響。
- 付費門檻：想讓 200 人都收到通知要中用量（3,000 則，2026-11-01 起 NT$1,000／月，剛好用滿）；超過約 400 人要高用量（NT$1,400 含 6,000 則，之後每則 NT$0.2）。1,000 人：NT$1,400 + 9,000 × 0.2 = NT$3,200／月。
- 建議：上線初期維持免費方案，接受通知會在月初就用完；或把通知改成使用者打開 LIFF 時才看到。是否付費由使用者決定（規格 §12 #5）。

## 預算與上限夠不夠

- **GCP 預算警示 NT$1,000／月**（`infra/budget.tf`，約 US$31）：只涵蓋 GCP（Cloud Run、GCS、Monitoring）。200 人約 US$14（NT$450），**夠用**，30% 警示（NT$300）在月中可能就會寄出，屬正常。1,000 人約 US$88（NT$2,800），**不夠**，人數超過約 400 人前要調高。
- **Anthropic 主控台每月上限**：200 人估算 US$19.5 × 2 = US$39 → 進位到 **US$40**（暫定，拿到實際 token 後重算）。上限到了 AI 功能會停（使用者看到「AI 忙碌」），其他功能正常。
- Neon、LINE、網域不在 GCP 預算裡，各自的帳單要另外看。

## 上線後要重算

上線一個月後，用「待執行的查詢」和 Cloud Billing 報表的實際數字重算一次，調整 AI 每日上限（規格 §12 #6）、GCP 預算警示和 Anthropic 上限。
