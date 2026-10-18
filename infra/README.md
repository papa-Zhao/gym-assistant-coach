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
2. 把連線字串寫入 Secret Manager（先把連線字串放進 `URL` 變數，不要寫進指令歷史或 commit）：

```sh
printf %s "$URL" | gcloud secrets versions add database-url --data-file=-
```

## 5. GitHub secret

**【使用者自行操作】** 建立 Neon API key 後存成 Actions secret（指令會提示輸入值）：

```sh
gh secret set NEON_API_KEY
```

## 6. GitHub variables

`deploy.yml` 使用五個 `vars.*`。前四個來自 Terraform（在 `infra/` 目錄下執行）：

| 變數              | 來源                                                        |
| ----------------- | ----------------------------------------------------------- |
| `GCP_PROJECT_ID`  | 你的 project id（同 bootstrap 參數）                        |
| `GCP_REGION`      | `asia-southeast1`                                           |
| `WIF_PROVIDER`    | `terraform output -raw wif_provider`                        |
| `DEPLOYER_SA`     | `terraform output -raw deployer_sa_email`                   |
| `NEON_PROJECT_ID` | Neon console 的專案設定（Project settings 中的 Project ID） |

```sh
gh variable set GCP_PROJECT_ID --body "<project-id>"
gh variable set GCP_REGION --body "asia-southeast1"
gh variable set WIF_PROVIDER --body "$(terraform output -raw wif_provider)"
gh variable set DEPLOYER_SA --body "$(terraform output -raw deployer_sa_email)"
gh variable set NEON_PROJECT_ID --body "<neon-project-id>"
```

其他輸出（`api_url`、`bot_url`、`liff_url`、`registry`）可用 `terraform output` 查看。

## 7. 部署

push 到 `main` 且 CI 成功後，Deploy workflow 會自動執行：備份 Neon（建立 `pre-migrate-<sha>` branch）、執行 migration，再部署 api、bot 與 liff。也可手動觸發 `workflow_dispatch`。只有本 repo 的 `main` 能使用 deployer 服務帳號。

## 8. 回滾：migration 出錯時

每次 migration 前會建立 Neon branch `pre-migrate-<sha>`，只保留最新 3 個。

1. 到 Neon console，找到出錯那次部署對應的 `pre-migrate-<sha>` branch。
2. 把 `main` branch 從該 branch 重設（Reset from parent / restore），資料即回到 migration 之前。
3. 修正問題後 push 新 commit，或將 Cloud Run 回到前一個 revision。

## 疑難排解

- **`deploy-liff` 回 403**：在 `infra/wif.tf` 為 deployer 服務帳號加上 `roles/serviceusage.serviceUsageConsumer`（或 `roles/firebase.viewer`），再 `terraform apply`。
- **migrate job 說讀不到 `database-url`**：該 secret 還沒有任何版本（重做第 4 步），或 deployer 服務帳號沒有存取權限（確認 `infra/wif.tf` 的 `roles/secretmanager.secretAccessor` 已套用）。
- **重跑同一個 commit 的部署，在 Neon 備份步驟失敗**：`pre-migrate-<sha>` 已存在。先到 Neon console 刪除該 branch，或 push 一個新 commit。
