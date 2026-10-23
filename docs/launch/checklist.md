# 上線檢查清單

全部打勾才公開上線。每一項寫了「怎麼做」和「怎麼確認」。標 **【使用者】** 的要用你自己的帳號在主控台或手機操作。

## 1. 服務信箱

- [ ] **【使用者】** `gymassistantcoach@gmail.com` 可以收信
  - 怎麼做：用另一個信箱寄一封測試信過去。
  - 怎麼確認：收得到；`apps/liff/public/privacy.html`、`terms.html` 上的地址就是這個（`apps/liff/src/legal.test.ts` 會檢查）。打開正式網址的兩頁，點信箱連結會開啟寫信畫面。
- [ ] **【使用者】** 信箱開啟兩步驟驗證，復原方式不是個人信箱以外的人。

## 2. 法律審閱

- [ ] **【使用者】** 隱私權政策與服務條款送法律專業人士審閱
  - 怎麼做：把正式網址的 `/privacy.html`、`/terms.html`（或兩個檔案）交給審閱者。特別請對方看：個資法第 8 條告知事項、跨境傳輸（Anthropic 在美國）、未滿 18 歲的處理、免責範圍、準據法。
  - 怎麼確認：審閱意見都處理完。有修改時：**實質變更**就把 `packages/shared/src/auth.ts` 和 `apps/bot/app/settings.py` 的 `CONSENT_VERSION` 一起改成修改當天的日期，並更新兩頁的「版本」（測試會檢查三者一致），所有人會重新同意；只修錯字或排版不改版本。
- [ ] **【使用者】** 確認政策頁寫的 Anthropic 資料處理仍與現行條款一致（2026-10-23 查證：API 資料預設不用於訓練、原則上 30 天內刪除，來源見 PR 10.3 計畫的交接備註）。

## 3. 網域

名稱上線前再決定。只讓 LIFF 和政策頁走自訂網域，api 維持 `run.app`。

- [ ] **【使用者】** 在 Cloudflare Registrar 購買網域
  - 怎麼做：Cloudflare 主控台 → **Domain Registration → Register Domains**，搜尋並購買（`.com` 約 US$10.46／年）。開啟自動續約。
  - 怎麼確認：網域出現在 Cloudflare 的網域列表，狀態 Active。
- [ ] **【使用者】** Firebase Hosting 加自訂網域
  - 怎麼做：Firebase 主控台 → Hosting → **Add custom domain**，輸入網域（例如 `app.<網域>` 或根網域），照畫面把 TXT／A 記錄加到 Cloudflare DNS。**Cloudflare 的 proxy（橘色雲）要關掉**，改成 DNS only，不然 Firebase 無法簽發憑證。
  - 怎麼確認：Firebase 顯示 Connected；`curl -I https://<網域>/privacy.html` 回 200，憑證有效。
- [ ] **【使用者】** LINE Developers 把 LIFF endpoint URL 改成新網域
  - 怎麼做：LINE Developers → LINE Login channel → **LIFF** → 該 LIFF app → Endpoint URL 改成 `https://<網域>/`。
  - 怎麼確認：在手機 LINE 打開 LIFF 連結，網址列是新網域，可以正常登入。
- [ ] **【使用者】** 更新 api 的 `CORS_ORIGIN` 與 bot 的 `PUBLIC_SITE_URL`
  - 怎麼做：兩個都來自 `infra/run.tf` 的 `local.public_site_url`（目前是 `https://<專案>-liff.web.app`）。改成新網域（只能是一個 exact origin，例如 `https://app.<網域>`），`terraform -chdir=infra plan` 確認只改 api 的 `CORS_ORIGIN` 和 bot 的 `PUBLIC_SITE_URL`，再 `apply`。
  - 怎麼確認：LIFF 在新網域打得開、資料載入正常（沒有 CORS 錯誤）。注意：改完後**舊網址的 LIFF 會因為 CORS 失敗**，所以要和上一步同時做。
- [ ] 同意卡片的條款連結跟著新網域走（bot 用 `PUBLIC_SITE_URL` 組連結）
  - 怎麼確認：用測試帳號觸發同意卡片（例如換一個新的測試 LINE 帳號加好友），點「服務條款」「隱私權政策」兩個連結都打得開，是新網域。
- [ ] 舊的 Firebase 預設網址（`*.web.app`）仍可打開政策頁（舊的同意卡片連結還在使用者的聊天紀錄裡）。

## 4. LINE 官方帳號

- [ ] **【使用者】** 名稱、頭像（核准的 logo）、狀態消息設定好
  - 怎麼確認：手機搜尋官方帳號，看到的名稱與頭像正確。
- [ ] **【使用者】** Messaging API 的 webhook 已開啟並驗證成功
  - 怎麼做：LINE Developers → Messaging API channel → **Webhook settings** → **Use webhook** 開啟，按 **Verify**。
  - 怎麼確認：Verify 顯示 Success。
- [ ] **【使用者】** 自動回應訊息與加入好友的歡迎訊息關閉（由 bot 處理）、聊天模式是 bot
  - 怎麼做：LINE Official Account Manager → **設定 → 回應設定**：聊天關閉（Bot 模式）、自動回應訊息關閉、Webhook 開啟；**加入好友的歡迎訊息**關閉。
  - 怎麼確認：用新帳號加好友，只收到 bot 的同意卡片，沒有重複的系統訊息。
- [ ] Rich Menu 已設定為預設
  - 怎麼確認：用新帳號加好友後，聊天室下方有選單，每個按鈕都能用。
- [ ] **【使用者】** **LINE Login channel 從「開發中」改成「已發布」**
  - 怎麼做：LINE Developers → LINE Login channel → 頂端狀態 **Developing → Publish**。
  - 怎麼確認：用**不是**該 channel 管理員或測試者的 LINE 帳號打開 LIFF，可以正常登入（開發中只有管理員與測試者能用）。
- [ ] **【使用者】** 確認目前方案與本月訊息用量
  - 怎麼做：LINE Official Account Manager → **用量**。
  - 怎麼確認：知道目前是輕用量（每月 200 則 push），以及用完後訓練完成通知會停（`docs/launch/cost-estimate.md` 的「LINE push」）。是否升級中用量（2026-11-01 起 NT$1,000／月）已經決定。

## 5. Anthropic

- [ ] **【使用者】** 主控台每月花費上限設為 **US$40**
  - 怎麼做：<https://console.anthropic.com> → **Settings → Limits**（步驟見 `infra/README.md` 第 11 節）。金額 = `cost-estimate.md` 200 人 AI 估算 US$19.5 × 2，進位到 US$5 的倍數。**拿到正式 token 平均值、重算 `cost-estimate.md` 後，用新的數字重算一次。**
  - 怎麼確認：Limits 頁面顯示的上限。
- [ ] **【使用者】** 用量通知寄到服務信箱
  - 怎麼做：同一頁設定 email notification（例如 US$20），收件人加 `gymassistantcoach@gmail.com`。
  - 怎麼確認：設定頁面顯示收件人。
- [ ] 正式金鑰只存在 Secret Manager
  - 怎麼確認：`gcloud secrets versions list anthropic-api-key` 只有預期的版本；repo、`.env`、CI 變數都沒有金鑰（`git grep -n "sk-ant-"` 沒有結果，測試假值除外）。

## 6. GCP

- [ ] **【使用者】** 預算警示 NT$1,000（30%／100%／預測 100%）的收件人正確
  - 怎麼做：Cloud Console → **Billing → Budgets & alerts** → 該預算。`infra/budget.tf` 沒有指定通知管道，預設寄給帳單管理員與使用者。
  - 怎麼確認：帳單管理員的信箱是你會看的信箱。200 人估算 GCP 每月約 NT$450，30% 警示月中就可能寄出，屬正常。人數接近 400 人時調高 `budget_amount_twd`。
- [ ] **【使用者】** PR 10.2 的 Cloud Monitoring 警示收得到
  - 怎麼做：Cloud Console → **Monitoring → Alerting → Notification channels** → 警示信箱那個管道 → **Send test notification**。
  - 怎麼確認：警示信箱收到測試信。
- [ ] **【使用者】** 打開 Cloud Monitoring 價目頁確認警示費用（PR 10.2 交接備註：8 個條件約 US$0.80／月，未完全確認）
  - 怎麼確認：一個月後在 Billing 報表看 Cloud Monitoring 的實際費用，低於 NT$30。
- [ ] Cloud Run `max_instance_count` 依負載測試結果確認
  - 怎麼確認：`docs/launch/load-test.md` 的「結果」已填，門檻都通過；沒通過時已決定要不要調 `max_instance_count` 或 pool 大小。

## 7. 負載測試

- [ ] **【使用者】** 照 `docs/launch/load-test.md` 跑完，並把結果填進「結果」
- [ ] **【使用者】** `api-loadtest` 服務已刪除
  - 怎麼確認：`gcloud run services list --region asia-southeast1` 只有 `api`、`bot`。
- [ ] **【使用者】** Neon 測試分支 `loadtest-YYYYMMDD` 已刪除
  - 怎麼確認：Neon 主控台的 Branches 列表沒有這個分支。

## 8. 成本

- [ ] **【使用者】** 在 Neon（正式分支）跑 `docs/launch/cost-estimate.md` 的「待執行的查詢」，把結果填進文件，重算 AI 那一列和 Anthropic 上限
- [ ] **【使用者】** 決定 Neon 方案：Free 每月 100 CU-小時，200 人估計約 120 CU-小時，用完時資料庫會暫停到下個月
  - 怎麼做：上線後第一週每天看 Neon 主控台的 **Usage**，推算月底的 CU-小時。會超過 100 就在超過前升級 Launch（約 US$13／月）。
  - 怎麼確認：Neon 主控台顯示的方案，以及本月 CU-小時用量的推算值低於上限。

## 9. 資料權利（PR 10.1）

- [ ] 用測試帳號在 iOS 和 Android 的 LINE 內建瀏覽器實際走一次
  - 匯出：LIFF 設定頁 →「更多」→「匯出我的資料」，下載的 JSON 打得開，內容是自己的資料、沒有內部 id、不含照片。
  - 刪除：「刪除我的所有資料」→ 確認。之後再傳訊息給官方帳號，應該看到同意卡片（像新使用者）；LIFF 也要重新同意。
- [ ] 每日排程有在跑
  - 怎麼做：Cloud Console → **Cloud Scheduler** → api 的每日排程（PR 10.1 建立，呼叫 `POST /jobs/daily`，台北時間 04:00）→ **Force run**。
  - 怎麼確認：Cloud Logging 篩選 `jsonPayload.event="daily_job"`，看到 `daily job done` 和 `deletedUsers` 數字。刪除測試帳號 7 天後，`deletedUsers` 會包含它，該帳號的照片在 GCS 也不見了（`gcloud storage ls gs://<照片 bucket>/meals/<userId>/` 沒有結果）。

## 10. 重新同意

- [ ] 所有測試帳號都重新同意過
  - 怎麼確認：用每個測試帳號傳一則訊息，先看到同意卡片，按同意後功能正常；LIFF 沒有卡在 `consent_required`。
  - 在 Neon SQL editor（正式分支，唯讀）：`select version, count(*) from consents group by version order by version;` 有 `2026-10-23` 的紀錄。

## 11. 上線當天

- [ ] 在 `main` 合併最後的 PR，CI（`deploy.yml`）的 api、bot、LIFF 部署都成功
  - 怎麼確認：GitHub Actions 全綠；`curl https://<api 網址>/health` 回 `{"status":"ok","service":"api"}`。
- [ ] **【使用者】** 用手機從加好友開始走一遍
  - 加好友 → 同意卡片 → 打開兩個政策連結（定稿內容，沒有「草稿」）→ 同意 → 填個人檔案 → 記一次訓練並完成（收到完成通知，除非本月 push 已用完）→ 拍一張餐點照片 → 問 AI 一個問題 → 打開今日總覽，熱量與訓練都有更新。
- [ ] 上線後 24 小時內看一次 Cloud Monitoring 與 ERROR log，沒有未處理的警示。
