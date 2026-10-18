# LINE 設定手冊

本手冊說明如何建立 LINE 官方帳號、LINE Login channel 與 LIFF app，並把機密寫入 Secret Manager。

標示 **【使用者自行操作】** 的步驟只有你能做（建立 LINE 帳號與 channel、貼上機密），請自己執行，不要交給 agent，也不要把 channel secret 或 access token 貼到對話、log 或 commit。

專案 ID：`gym-assistant-coach-4734`。

## 為什麼順序很重要

Cloud Run 的 `bot` 會以 `latest` 版本掛載 `line-channel-secret` 與 `line-channel-access-token`。這兩個 secret 在沒有版本時，新 revision 會啟動失敗。所以請依下列順序：

1. 先只建立 secret（步驟 A）。
2. 到 LINE 取得值並寫入 secret（步驟 1 至 7）。
3. 再做完整 `terraform apply`，並把 Webhook 指向 `bot`（步驟 8 至 10）。

## A. 先建立兩個空的 secret

**【使用者自行操作】**（需要你的 GCP 登入）

```sh
cd infra
terraform init -backend-config=backend.hcl
terraform apply \
  -target=google_secret_manager_secret.line_channel_secret \
  -target=google_secret_manager_secret.line_channel_access_token
```

## 1. 建立 Provider

**【使用者自行操作】** 到 [LINE Developers Console](https://developers.line.biz/console/) 建立一個 Provider（例如 `gym-assistant-coach`）。

後面的 Messaging API channel 與 LINE Login channel 都要放在**同一個 Provider**，同一個 Provider 下的 LINE userId 才會一致。

## 2. 建立官方帳號並啟用 Messaging API

**【使用者自行操作】**

1. 用 [LINE Official Account Manager](https://manager.line.biz/) 建立官方帳號。
2. 在帳號的「設定」>「Messaging API」按「啟用 Messaging API」，Provider 選步驟 1 建立的那一個。

## 3. 回應設定

**【使用者自行操作】** 在 LINE Official Account Manager 的「設定」>「回應設定」：

- 關閉「自動回應訊息」。
- 關閉「加入好友的歡迎訊息」。
- 開啟 Webhook（網址在步驟 9 填寫）。

## 4. 發行長期 channel access token

**【使用者自行操作】** 在 LINE Developers Console 開啟這個 Messaging API channel，到「Messaging API」分頁最下方的 Channel access token (long-lived)，按 Issue。同一頁可以取得 Channel secret（在「Basic settings」分頁）。先不要複製出來，步驟 7 直接貼進終端機。

## 5. 建立 LINE Login channel

**【使用者自行操作】** 在**同一個 Provider** 新增 LINE Login channel（Channel type 選 LINE Login，App types 勾選 Web app）。

## 6. 新增 LIFF app

**【使用者自行操作】** 在這個 LINE Login channel 的「LIFF」分頁按 Add：

| 欄位                | 值                                              |
| ------------------- | ----------------------------------------------- |
| Size                | Full                                            |
| Endpoint URL        | `https://gym-assistant-coach-4734-liff.web.app` |
| Scope               | `openid`、`profile`                             |

建立後會得到 LIFF ID（格式類似 `1234567890-AbcdEfgh`）。

## 7. 把機密寫入 Secret Manager

**【使用者自行操作】** 先用 `read -rs` 把值讀進變數（輸入不會顯示，也不會進入 shell 歷史），再用 `printf` 寫入，與 `database-url` 的做法相同：

```sh
read -rs LINE_CHANNEL_SECRET
printf %s "$LINE_CHANNEL_SECRET" | gcloud secrets versions add line-channel-secret --project gym-assistant-coach-4734 --data-file=-
unset LINE_CHANNEL_SECRET

read -rs LINE_CHANNEL_ACCESS_TOKEN
printf %s "$LINE_CHANNEL_ACCESS_TOKEN" | gcloud secrets versions add line-channel-access-token --project gym-assistant-coach-4734 --data-file=-
unset LINE_CHANNEL_ACCESS_TOKEN
```

## 8. 填入 LINE Login channel ID 與 LIFF ID，並套用 Terraform

這兩個值都不是機密。

1. LINE Login channel ID 在該 channel 的「Basic settings」分頁；LIFF ID 在步驟 6 建立的 LIFF app。
2. 填入 `infra/terraform.tfvars`：

   ```hcl
   line_login_channel_id = "<LINE Login channel ID>"
   liff_id               = "<LIFF ID>"
   ```

   （`infra/bootstrap.sh` 重跑時會保留這兩個值。）

3. **【使用者自行操作】** 完整套用：

   ```sh
   cd infra
   terraform apply
   ```

4. 設定 GitHub variables，讓 LIFF 建置時帶入 ID 與 API 網址：

   ```sh
   gh variable set LIFF_ID --body "<LIFF ID>"
   gh variable set API_URL --body "$(terraform output -raw api_url)"
   ```

   然後 push 到 `main` 觸發部署（或手動觸發 `Deploy` workflow），讓 `bot`、`api` 換成真正的 image，LIFF 也會以新的環境變數重新建置。

## 9. 設定 Webhook URL 並驗證

**【使用者自行操作】** Webhook URL 是 Terraform output `bot_url` 加上 `/webhook`，請從 `terraform output` 讀取：

```sh
echo "$(terraform output -raw bot_url)/webhook"
```

目前的值為 `https://bot-i3z5vwadgq-as.a.run.app/webhook`（以 `terraform output` 為準）。

1. 在 LINE Developers Console 的 Messaging API channel，「Messaging API」分頁填入 Webhook URL，並開啟「Use webhook」。
2. 按 **Verify**，應顯示 Success。這一步需要 `bot` 已部署並設好 `LINE_CHANNEL_SECRET`（步驟 8 與 push 部署完成後）。

## 10. 試用

**【使用者自行操作】** 用手機加官方帳號為好友，第一次互動時會出現同意流程（服務條款、隱私權政策、年滿 18 歲）。同意後即可開啟 LIFF。

## 疑難排解

- **Verify 失敗**：確認 `bot` 已部署真正的 image（不是 hello placeholder），且 `line-channel-secret` 的值正確。
- **`terraform apply` 說 secret 沒有版本**：回到步驟 7，確認兩個 LINE secret 都已有版本。
- **LIFF 開啟後登入失敗**：確認 `liff_id`、`line_login_channel_id` 已填入並重新 apply，且 GitHub variables `LIFF_ID`、`API_URL` 已設定並重新部署 LIFF。
