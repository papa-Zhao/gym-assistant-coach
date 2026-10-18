# 部署手冊

GCP（Cloud Run、Artifact Registry、GCS、Secret Manager）以 Terraform 管理，LIFF 放在 Firebase Hosting，資料庫為 Neon（`aws-ap-southeast-1`）。CI 只透過 Workload Identity Federation（WIF）取得 GCP 權限，不存放長期金鑰。

標示 **【使用者自行操作】** 的步驟涉及密碼或金鑰，請自己執行，不要交給 agent 或貼到對話中。

## 1. 前置作業

**【使用者自行操作】** 登入 Application Default Credentials（Terraform 使用）：

```sh
gcloud auth login
gcloud auth application-default login
```

## 2. Bootstrap

建立 GCP 專案、連結帳單、啟用必要 API，並建立 Terraform state bucket（可重複執行）：

```sh
./infra/bootstrap.sh <project-id>
```

腳本會用實際的 project id 改寫三個檔案：`infra/terraform.tfvars`、`infra/backend.hcl`、`.firebaserc`。**第一次部署前請先 commit 這三個檔案**，因為 CI 的 `deploy-liff` 需要真正的 `.firebaserc`：

```sh
git add infra/terraform.tfvars infra/backend.hcl .firebaserc
git commit -m "chore(infra): set real project id"
```

## 3. Terraform

```sh
cd infra
terraform init -backend-config=backend.hcl
terraform apply
```

會建立 Cloud Run（`api`、`bot`）、Artifact Registry、私有照片 bucket（90 天後自動刪除）、Secret Manager、WIF、Firebase Hosting site，以及帳單預算。

預算為 NT$1,000（帳單帳戶幣別為 TWD），通知門檻：30%、100%、預測 100%。

## 4. Neon 與 `database-url`

**【使用者自行操作】**

1. 在 Neon 建立專案：region 選 `aws-ap-southeast-1`，資料庫名稱 `gac`。
2. 把連線字串寫入 Secret Manager。migration 請使用直連（非 pooled）連線字串。先用 `read -rs` 把連線字串讀進 `URL` 變數（輸入不會顯示，也不會進入 shell 歷史），不要 commit：

```sh
read -rs URL
printf %s "$URL" | gcloud secrets versions add database-url --project <project-id> --data-file=-
```

## 5. GitHub secret

**【使用者自行操作】** 建立 Neon API key 後存成 Actions secret（指令會提示輸入值）：

```sh
gh secret set NEON_API_KEY
```

## 6. GitHub variables

`deploy.yml` 使用七個 `vars.*`。其中 `WIF_PROVIDER` 與 `DEPLOYER_SA` 來自 Terraform output（在 `infra/` 目錄下執行），其餘自行填入：

| 變數              | 來源                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `GCP_PROJECT_ID`  | 你的 project id（同 bootstrap 參數）                                                       |
| `GCP_REGION`      | `asia-southeast1`                                                                          |
| `WIF_PROVIDER`    | `terraform output -raw wif_provider`                                                       |
| `DEPLOYER_SA`     | `terraform output -raw deployer_sa_email`                                                  |
| `NEON_PROJECT_ID` | Neon console 的專案設定（Project settings 中的 Project ID）                                |
| `LIFF_ID`         | LINE LIFF app 的 ID，見 [LINE 設定手冊](../docs/line-setup.md)                             |
| `API_URL`         | `https://api-<project number>.asia-southeast1.run.app`，或 `terraform output -raw api_url` |

```sh
gh variable set GCP_PROJECT_ID --body "<project-id>"
gh variable set GCP_REGION --body "asia-southeast1"
gh variable set WIF_PROVIDER --body "$(terraform output -raw wif_provider)"
gh variable set DEPLOYER_SA --body "$(terraform output -raw deployer_sa_email)"
gh variable set NEON_PROJECT_ID --body "<neon-project-id>"
gh variable set LIFF_ID --body "<liff-id>"
gh variable set API_URL --body "$(terraform output -raw api_url)"
```

`LIFF_ID` 與 `API_URL` 會在 deploy 時以 `VITE_LIFF_ID`、`VITE_API_URL` 傳給 LIFF 建置。

其他輸出（`api_url`、`bot_url`、`liff_url`、`registry`）可用 `terraform output` 查看。

## 7. LINE 設定

建立 LINE 官方帳號、LINE Login channel、LIFF app，並把 channel secret 與 access token 寫入 Secret Manager，請照 [LINE 設定手冊](../docs/line-setup.md)。注意順序：`line-channel-secret` 與 `line-channel-access-token` 沒有版本時，`bot` 的新 revision 無法啟動，所以手冊先只建立 secret，寫入值之後才做完整 `terraform apply`。`api-session-secret` 由 Terraform 自動產生（`random_password`，48 字元），不需手動處理。

## 8. 部署

push 到 `main` 且 CI 成功後，Deploy workflow 會自動執行：備份 Neon（建立 `pre-migrate-<sha>` branch）、執行 migration，再部署 api、bot 與 liff。也可手動觸發 `workflow_dispatch`。只有本 repo 的 `main` 能使用 deployer 服務帳號。

## 9. 回滾：migration 出錯時

每次 migration 前會建立 Neon branch `pre-migrate-<sha>`，只保留最新 3 個。

1. 決定還原時間點：取 GitHub Actions 該次 Deploy 的 migrate job 開始時間，或 `pre-migrate-<sha>` branch 在 Neon **Branches** 頁顯示的建立時間，並取稍早於此的時間。
2. 在 Neon console 選取預設分支（`main` 或 `production`），進入 **Postgres database** > **Backup & Restore** > **Restore from history**。
3. 確認選在 **From history** 分頁，輸入上述時間（或切換為 LSN）。
4. 按 **Next**，檢視確認視窗後按 **Restore**。
5. 修正問題後 push 新 commit，或將 Cloud Run 回到前一個 revision。

注意：

- 還原是整個覆蓋，不是合併。所選時間點之後寫入預設分支的資料都會遺失。Neon 會先把還原前的預設分支另存為 `<分支名>_old_<timestamp>` branch，必要時可救回。
- 可還原的歷史長度依 Neon 方案而異，Neon 文件未列出各方案的天數，請查 Neon 的 History window 說明；要還原的時間點必須在此範圍內。
- 以上標籤取自 Neon 官方文件（branch-restore）。
- `pre-migrate-<sha>` 是 migration 前的快照，用來檢視或複製當時的資料。Neon 的「從另一個 branch 還原」要求來源為 root branch，因此不要把它當作還原來源。它只保留最新 3 個。

## 疑難排解

- **`deploy-liff` 回 403**：在 `infra/wif.tf` 為 deployer 服務帳號加上 `roles/serviceusage.serviceUsageConsumer`（或 `roles/firebase.viewer`），再 `terraform apply`。
- **migrate job 說讀不到 `database-url`**：該 secret 還沒有任何版本（重做第 4 步），或 deployer 服務帳號沒有存取權限（確認 `infra/wif.tf` 的 `roles/secretmanager.secretAccessor` 已套用）。
- **重跑同一個 commit 的部署**：備份步驟會偵測到已存在的 `pre-migrate-<sha>` 並沿用，不會失敗，仍會清理舊備份。若備份步驟仍失敗，請檢查 `NEON_API_KEY` 與 `NEON_PROJECT_ID`。
