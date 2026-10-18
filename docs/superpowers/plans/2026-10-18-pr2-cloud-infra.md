# PR 2: Cloud Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a push to `main` passes CI, GitHub Actions backs up Neon, runs migrations, and deploys `api` and `bot` to Cloud Run and `liff` to Firebase Hosting. Each service's `/health` then returns ok.

**Architecture:** A one-time `gcloud` bootstrap script creates the GCP project and the Terraform state bucket. Terraform in `infra/` manages everything else in GCP. CI never runs Terraform. It only builds images, migrates and deploys, using a deployer service account reached through Workload Identity Federation (WIF). Cloud Run services start on Google's `hello` image, and Terraform ignores image changes after that so later CI deploys are not reverted. Neon is created by hand in the console, and Terraform does not manage it.

**Tech Stack:** Terraform ≥ 1.16 (`hashicorp/google` and `google-beta`, same major), GitHub Actions, Docker, Cloud Run v2, Artifact Registry, Secret Manager, GCS, Firebase Hosting, Neon, Drizzle Kit + `postgres` (postgres.js), Node 24 built-in `node --test`.

**Spec:** [docs/specs/2026-10-15-gym-assistant-coach-design.md](../../specs/2026-10-15-gym-assistant-coach-design.md) (§3.3, §8, §9, §10 PR 2, §12)

## Global Constraints

- Region: Cloud Run, Artifact Registry and GCS are in `asia-southeast1`, and Neon is in `aws-ap-southeast-1`.
- Cloud Run: `min instances = 0`, with CPU only allocated during requests (`cpu_idle = true`). Max instances is 3 as a cost cap.
- Do not store long-lived GCP keys anywhere. CI authenticates only through WIF.
- Secrets go in Secret Manager (GCP side) or GitHub Actions secrets (`NEON_API_KEY` only). Neither secret is ever committed or printed in logs.
- The photo bucket is private (public access prevention is enforced) and objects are deleted after 90 days.
- Billing account: `01E664-BCA62E-9FC80C` ("Side Project帳戶"). **Its currency is TWD**, so the spec's US$10 / US$30 alerts become a single NT$1,000 budget with alerts at 30% (≈ US$10), 100% (≈ US$30) and forecast 100%.
- GitHub repo: `papa-Zhao/gym-assistant-coach`. Only `refs/heads/main` of this repo can assume the deployer account.
- LIFF is hosted on Firebase Hosting (decided 2026-10-18, closes spec §12 #3).
- The user performs these steps themselves: creating the Neon project, pasting the connection string into Secret Manager, and adding `NEON_API_KEY` to GitHub. The agent never handles these values.
- Every new file passes the existing `npm run lint` (eslint + prettier). Terraform passes `terraform fmt -check`.

## Review Focus

1. **A PR branch or fork tries to deploy.** The WIF provider must reject any token whose repo isn't ours or whose ref isn't `main`. This is pinned by a `terraform test` assertion in Task 3.
2. **`terraform apply` runs after CI has deployed.** It must not roll the services back to `hello`. Task 3 adds `ignore_changes` on image/client, and Task 7 checks that `terraform plan` shows no changes after the first deploy.
3. **The backup pruning deletes the wrong Neon branch.** Only branches named `pre-migrate-*` may be deleted, and never the default branch. This is covered by node tests in Task 2.
4. **The `database-url` secret has no version yet.** The migrate job must fail with a clear message before touching Neon, not with a vague driver error. This is covered by a guard step in Task 5, exercised in Task 7.
5. **A LIFF deep link is opened directly** (e.g. `/settings`). Firebase must serve `index.html` instead of a 404. This is covered by the rewrite in Task 4 and a curl check in Task 7.

---

## File Structure

| Path                                       | Responsibility                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `apps/api/Dockerfile`, `.dockerignore`     | Self-contained Node 24 image running the bundled `dist/server.js`               |
| `apps/api/tsup.config.ts` (modify)         | Bundle all deps so the runtime image needs no `node_modules`                    |
| `apps/bot/Dockerfile`                      | Python 3.12 + uv image running uvicorn                                          |
| `apps/api/drizzle.config.ts`               | Drizzle Kit config: schema path, `../../db/migrations`, `DATABASE_URL`          |
| `apps/api/src/db/schema.ts`                | Empty schema placeholder (tables arrive in PR 3)                                |
| `db/migrations/`                           | Generated SQL migrations + Drizzle journal                                      |
| `infra/bootstrap.sh`                       | One-time: create project, link billing, enable base APIs, create state bucket   |
| `infra/*.tf`                               | Terraform root module, split by concern (see Tasks 3–4)                         |
| `infra/tests/*.tftest.hcl`                 | `terraform test` with mock providers                                            |
| `infra/scripts/neon-backup.mjs` (+ test)   | Create a `pre-migrate-<sha>` Neon branch and prune old ones                     |
| `infra/README.md`                          | Bootstrap, manual steps and apply runbook                                       |
| `firebase.json`, `.firebaserc`             | Firebase Hosting site for `apps/liff/dist`                                      |
| `.github/workflows/ci.yml` (modify)        | Add container smoke tests, infra checks, `node --test`                          |
| `.github/workflows/deploy.yml`             | After CI succeeds on `main`: backup → migrate → deploy api, bot, liff           |

---

### Task 1: Container images for `api` and `bot`

**Files:**

- Modify: `apps/api/tsup.config.ts`
- Create: `apps/api/Dockerfile`, `apps/bot/Dockerfile`, `.dockerignore` (repo root, for both contexts)
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Produces: `docker build -f apps/api/Dockerfile .` (context = repo root) and `docker build apps/bot` (context = `apps/bot`). Both images listen on `$PORT` (default 8080) and serve `GET /health`.

- [ ] **Step 1: Add a failing CI job `images`** that builds each image, runs it with `-e PORT=8080 -p 8080:8080`, and asserts `curl -fsS localhost:8080/health` equals `{"status":"ok","service":"api"}` (and `"bot"` for the bot). Poll for up to 20 s before failing.
- [ ] **Step 2: Bundle all of api's deps.** In `tsup.config.ts`, set `noExternal: [/.*/]`, then run `npm run build -w @gac/api && node apps/api/dist/server.js` from an empty temp dir copy. Expected: the server starts without `node_modules`.
- [ ] **Step 3: Write `apps/api/Dockerfile`.** Build stage: `node:24-slim`, `npm ci`, then `npm run build -w @gac/api`. Runtime stage: `node:24-slim`, `USER node`, copy only `apps/api/dist`, then `CMD ["node","dist/server.js"]`.
- [ ] **Step 4: Write `apps/bot/Dockerfile`.** Base: `python:3.12-slim`. Copy `uv` from `ghcr.io/astral-sh/uv` (pin the tag) and run `uv sync --locked --no-dev`. Run as a non-root user. CMD: `uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}` (shell form so `$PORT` expands).
- [ ] **Step 5: Write `.dockerignore`.** Exclude `node_modules`, `dist`, `.venv`, `__pycache__`, `.git`, `infra`, `docs`.
- [ ] **Step 6: Push the branch.** Expected: the CI `images` job passes. Docker isn't installed locally, so CI is the place this gets verified.
- [ ] **Step 7: Commit:** `build: add api and bot container images`

### Task 2: Migration flow and Neon backup script

**Files:**

- Create: `apps/api/drizzle.config.ts`, `apps/api/src/db/schema.ts`, `db/migrations/0000_init.sql` (+ `meta/`)
- Modify: `apps/api/package.json`
- Create: `infra/scripts/neon-backup.mjs`, `infra/scripts/neon-backup.test.mjs`
- Modify: root `package.json`

**Interfaces:**

- Produces: `npm run db:migrate -w @gac/api`, which reads `DATABASE_URL` and applies `db/migrations`.
- Produces: `node infra/scripts/neon-backup.mjs <sha>`, which reads env `NEON_API_KEY` and `NEON_PROJECT_ID`. It creates branch `pre-migrate-<sha>` from the default branch, then deletes `pre-migrate-*` branches beyond the newest 3. It exits non-zero on any API error.
- Exported pure function: `branchesToDelete(branches: {id: string, name: string, default: boolean, created_at: string}[], keep: number): string[]` (returns ids).

- [ ] **Step 1: Write the failing tests** in `neon-backup.test.mjs` (`node:test` + `node:assert`):
  - `keeps newest 3 pre-migrate branches`: given 5 `pre-migrate-*` branches with ascending `created_at`, it returns the ids of the oldest 2.
  - `never deletes non-prefixed branches`: a `main` (default) branch and a `dev` branch are never returned.
  - `never deletes the default branch even if prefixed`: a branch with `default: true` named `pre-migrate-x` is not returned.
  - `returns [] when at or under keep`.
- [ ] **Step 2: Run the tests:** `node --test infra/scripts/`. Expected: FAIL, because the module isn't found.
- [ ] **Step 3: Implement `neon-backup.mjs`.** Export `branchesToDelete`. Main runs only when the file is executed directly (`import.meta.main`). Neon API base: `https://console.neon.tech/api/v2/projects/{id}/branches`. Create: `POST` with `{branch:{name}}`, plus wait until the response's `operations` finish (poll `GET /operations/{id}` until `finished`, 60 s timeout). List: `GET`. Delete: `DELETE /branches/{branch_id}`. Use global `fetch` and `Authorization: Bearer`.
- [ ] **Step 4: Run the tests:** `node --test infra/scripts/`. Expected: PASS. Then add root script `"test:infra": "node --test infra/scripts/"`.
- [ ] **Step 5: Set up Drizzle.** Add deps `drizzle-orm` and `postgres`, and devDep `drizzle-kit`. Make `schema.ts` contain only `export {};`. In `drizzle.config.ts`, set `dialect: "postgresql"`, `schema: "./src/db/schema.ts"`, `out: "../../db/migrations"`, and `dbCredentials.url: process.env.DATABASE_URL!`. Add scripts `"db:generate": "drizzle-kit generate"` and `"db:migrate": "drizzle-kit migrate"`.
- [ ] **Step 6: Generate the first migration:** `npx drizzle-kit generate --custom --name=init -w @gac/api`. Make the body a single comment plus `SELECT 1;`. It exists only so the pipeline can be tested end to end.
- [ ] **Step 7: Verify locally** with a throwaway Postgres if one is available (`DATABASE_URL=postgres://… npm run db:migrate -w @gac/api`). Otherwise defer to Task 7. Run `npm run lint && npm run typecheck && npm test`. Expected: all pass.
- [ ] **Step 8: Commit:** `feat(db): add drizzle migration flow and neon backup script`

### Task 3: Terraform core (project services, registry, secrets, bucket, Cloud Run, WIF)

**Files:**

- Create: `infra/bootstrap.sh`, `infra/backend.hcl`, `infra/versions.tf`, `infra/variables.tf`, `infra/terraform.tfvars`, `infra/apis.tf`, `infra/registry.tf`, `infra/secrets.tf`, `infra/storage.tf`, `infra/run.tf`, `infra/wif.tf`, `infra/outputs.tf`, `infra/tests/core.tftest.hcl`, `.terraform.lock.hcl` (committed)
- Modify: `.gitignore` (`infra/.terraform/`, `*.tfstate*`), `.prettierignore` if needed

**Interfaces:**

- Variables: `project_id` (string), `region` (default `asia-southeast1`), `billing_account` (string), `github_repo` (default `papa-Zhao/gym-assistant-coach`), `budget_amount_twd` (number, default `1000`).
- Resource names that later tasks rely on:
  - Artifact Registry repo: `gac`, Docker format. Image paths are `asia-southeast1-docker.pkg.dev/<project>/gac/{api,bot}:<sha>`.
  - Cloud Run services: `api`, `bot`.
  - Runtime SAs: `api-runtime@`, `bot-runtime@`.
  - Deployer SA: `github-deployer@`.
  - Secret: `database-url`.
  - Bucket: `<project>-meal-photos`.
- Outputs: `wif_provider` (full provider resource name), `deployer_sa_email`, `api_url`, `bot_url`, `registry`.

- [ ] **Step 1: Write the failing `tests/core.tftest.hcl`.** Use `mock_provider "google"` and `mock_provider "google-beta"` and `command = plan`, with these assertions:
  - The photo bucket has `public_access_prevention == "enforced"`, `uniform_bucket_level_access == true`, a lifecycle rule `Delete` at `age == 90`, and `soft_delete_policy[0].retention_duration_seconds == 0`.
  - Both Cloud Run services have `scaling[0].min_instance_count == 0` and `max_instance_count == 3`, and the container `cpu_idle == true`.
  - The WIF provider's `attribute_condition == "assertion.repository == \"papa-Zhao/gym-assistant-coach\" && assertion.ref == \"refs/heads/main\""`.
- [ ] **Step 2: Run the test:** `cd infra && terraform init -backend=false && terraform test`. Expected: FAIL (resources are undefined).
- [ ] **Step 3: Write `bootstrap.sh <project-id>`.** It must be idempotent and use `set -euo pipefail`. It runs:
  - `gcloud projects create`
  - `gcloud billing projects link` (billing account `01E664-BCA62E-9FC80C`)
  - `gcloud services enable serviceusage cloudresourcemanager storage billingbudgets`
  - `gcloud storage buckets create gs://<project>-tfstate --location=asia-southeast1 --uniform-bucket-level-access --public-access-prevention`, then versioning on

  Finally, it writes `backend.hcl` with `bucket = "<project>-tfstate"` and `prefix = "infra"`.
- [ ] **Step 4: Write `versions.tf`.** Require Terraform `>= 1.16`, with `google` + `google-beta` providers on the latest major (check the registry at implementation time and pin `~> N.0`). Use a GCS backend (partial config from `backend.hcl`). Configure the providers with `project`, `region`, `user_project_override = true` and `billing_project = var.project_id`.
- [ ] **Step 5: Write `apis.tf`.** Use `google_project_service` with `for_each` over `run`, `artifactregistry`, `secretmanager`, `iam`, `iamcredentials`, `sts`, `storage`, `firebase`, `firebasehosting`, `billingbudgets`, `cloudresourcemanager`, `serviceusage`. Set `disable_on_destroy = false`.
- [ ] **Step 6: Write `registry.tf`.** Create repo `gac` with a cleanup policy that keeps the 10 most recent versions and deletes untagged versions older than 7 days.
- [ ] **Step 7: Write `secrets.tf` and the runtime SAs.** Create secret `database-url` with automatic replication and **no version** (the user adds it). Create the `api-runtime` and `bot-runtime` SAs. Grant `api-runtime` `secretAccessor` on `database-url` and `storage.objectAdmin` on the photo bucket.
- [ ] **Step 8: Write `storage.tf`.** Create the photo bucket per the Step 1 assertions, with `location = var.region`.
- [ ] **Step 9: Write `run.tf`.** Create `google_cloud_run_v2_service` `api` and `bot`:
  - image `us-docker.pkg.dev/cloudrun/container/hello`
  - SA = the matching runtime SA
  - `ingress = INGRESS_TRAFFIC_ALL`, scaling 0–3, `cpu_idle = true`, 1 CPU, 512Mi
  - `lifecycle { ignore_changes = [template[0].containers[0].image, client, client_version] }`

  Also grant `allUsers` `run.invoker` on both. LIFF calls `api`, and LINE calls `bot`. App-level auth arrives in PR 3.
- [ ] **Step 10: Write `wif.tf`.**
  - Pool `github`, with provider `github-actions` (issuer `https://token.actions.githubusercontent.com`).
  - Mapping: `google.subject = assertion.sub`, `attribute.repository`, `attribute.ref`.
  - The condition from Step 1.
  - Deployer SA `github-deployer`, granted `iam.workloadIdentityUser` to `principalSet://…/attribute.repository/<github_repo>`.
  - Deployer roles:
    - `run.developer` (project)
    - `iam.serviceAccountUser` on both runtime SAs
    - `artifactregistry.writer` on repo `gac`
    - `secretmanager.secretAccessor` on `database-url`
    - `firebasehosting.admin` (project)
- [ ] **Step 11: Run the tests:** `terraform fmt -check && terraform validate && terraform test`. Expected: PASS.
- [ ] **Step 12: Commit:** `feat(infra): add terraform for project services, cloud run and WIF`

### Task 4: Terraform Firebase Hosting and budget, plus Firebase config

**Files:**

- Create: `infra/firebase.tf`, `infra/budget.tf`, `infra/tests/budget.tftest.hcl`, `firebase.json`, `.firebaserc`
- Modify: `infra/outputs.tf` (`liff_url`)

**Interfaces:**

- Consumes: `var.project_id`, `var.billing_account`, `var.budget_amount_twd` (Task 3).
- Produces: hosting site id `<project_id>-liff` and output `liff_url = "https://<project_id>-liff.web.app"`. `firebase.json` targets this site through `.firebaserc` target `liff`.

- [ ] **Step 1: Write the failing `budget.tftest.hcl`.** Assert that the budget amount is `currency_code == "TWD"` and `units == "1000"`. Assert that the threshold rules are exactly `{0.3 CURRENT_SPEND, 1.0 CURRENT_SPEND, 1.0 FORECASTED_SPEND}`. Assert that the filter is scoped to this project only.
- [ ] **Step 2: Run the test:** `terraform test`. Expected: FAIL.
- [ ] **Step 3: Write `budget.tf`.** Use `google_billing_budget` on `var.billing_account` per the test. Keep the default IAM-recipient email notifications, so billing admins get the alert.
- [ ] **Step 4: Write `firebase.tf`.** Use `google_firebase_project` (google-beta), then `google_firebase_hosting_site` with `site_id = "${var.project_id}-liff"`.
- [ ] **Step 5: Write `firebase.json`.** Set `hosting.target = "liff"`, `public = "apps/liff/dist"`, and rewrite `**` → `/index.html`. Set `Cache-Control: public,max-age=31536000,immutable` on `/assets/**` and `no-cache` on `index.html`. In `.firebaserc`, set the default project and `targets.<project>.hosting.liff = ["<project>-liff"]`.
- [ ] **Step 6: Run the checks:** `terraform test && npm run lint`. Expected: PASS.
- [ ] **Step 7: Commit:** `feat(infra): add firebase hosting site and billing budget`

### Task 5: Deploy workflow and CI infra checks

**Files:**

- Create: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/ci.yml` (adds job `infra`: `hashicorp/setup-terraform`, `terraform fmt -check -recursive infra`, `terraform -chdir=infra init -backend=false`, `validate`, `test`, then `npm run test:infra`)

**Interfaces:**

- Consumes GitHub repo **variables**: `GCP_PROJECT_ID`, `GCP_REGION`, `WIF_PROVIDER`, `DEPLOYER_SA`, `NEON_PROJECT_ID`.
- Consumes repo **secret**: `NEON_API_KEY`.
- Consumes Task 3 names (repo `gac`, services `api` and `bot`, secret `database-url`), Task 4's `.firebaserc` target, and Task 2's scripts.

- [ ] **Step 1: Trigger.** Set `on: workflow_run: { workflows: [CI], types: [completed], branches: [main] }` plus `workflow_dispatch`. Every job runs only `if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'` and checks out `github.event.workflow_run.head_sha || github.sha`. Set `permissions: { contents: read, id-token: write }`. Use `concurrency: deploy` with no cancellation, so deploys never overlap.
- [ ] **Step 2: Add job `migrate`.**
  - Authenticate with `google-github-actions/auth` (WIF).
  - Read the secret with `gcloud secrets versions access latest --secret=database-url` into a masked env var (`::add-mask::`).
  - Guard: if the read fails or the value is empty, echo `database-url has no version; see infra/README.md` and exit 1.
  - Run `node infra/scripts/neon-backup.mjs $SHA`, then `npm ci` and `npm run db:migrate -w @gac/api`.
- [ ] **Step 3: Add jobs `deploy-api` and `deploy-bot`** (`needs: migrate`). Each one:
  - authenticates (WIF)
  - runs `gcloud auth configure-docker asia-southeast1-docker.pkg.dev`
  - builds and pushes `…/gac/<svc>:<sha>`
  - runs `gcloud run deploy <svc> --image … --region $GCP_REGION --quiet`
  - checks `curl -fsS "$(gcloud run services describe <svc> --format='value(status.url)')/health"`
- [ ] **Step 4: Add job `deploy-liff`** (independent of `migrate`). It authenticates (WIF, `create_credentials_file: true`), runs `npm ci && npm run build -w @gac/liff`, then `npx firebase-tools@<pinned> deploy --only hosting:liff --project $GCP_PROJECT_ID --non-interactive`.
- [ ] **Step 5: Push the branch.** Expected: the CI `infra` job passes. `deploy.yml` doesn't run on PRs; GitHub validates its syntax when the file is pushed.
- [ ] **Step 6: Commit:** `ci: deploy to cloud run and firebase after CI on main`

### Task 6: Runbook

**Files:**

- Create: `infra/README.md`
- Modify: `README.md` (add a "部署" section linking to `infra/README.md`)

- [ ] **Step 1: Write `infra/README.md` in 繁體中文.** It covers, in order:
  1. Prerequisites (`gcloud auth application-default login`, done by the user)
  2. `./infra/bootstrap.sh <project-id>`
  3. `terraform init -backend-config=backend.hcl && terraform apply`
  4. **User-only:** create the Neon project in `aws-ap-southeast-1` with database `gac`, then run `printf %s "$URL" | gcloud secrets versions add database-url --data-file=-`
  5. **User-only:** `gh secret set NEON_API_KEY`
  6. `gh variable set` for the five variables, taken from `terraform output`
  7. How to roll back a bad migration (reset the main branch from `pre-migrate-<sha>` in the Neon console)
- [ ] **Step 2: Run** `npm run lint`. Expected: PASS. Then commit: `docs(infra): add deployment runbook`

### Task 7: Provision, merge, verify (operational; each outward step is confirmed with the user)

- [ ] **Step 1: Confirm, then run** `./infra/bootstrap.sh gym-assistant-coach-<4 hex>`. Expected: the project is linked to billing and the state bucket exists.
- [ ] **Step 2: Run** `terraform plan`. Show the summary to the user, then `terraform apply` after their yes. Expected: the outputs are printed. `curl <api_url>` and `<bot_url>` return the hello page.
- [ ] **Step 3: User performs** Task 6 steps 4–5. The agent then sets the five repo variables with `gh variable set` (after confirming with the user).
- [ ] **Step 4: Open the PR** to `main` and wait for review. Expected: CI is green (node, bot, images, infra).
- [ ] **Step 5: After the user merges, check the run.** Expected: `deploy.yml` succeeds. `GET <api_url>/health` → `{"status":"ok","service":"api"}`, and the same for `bot`. `curl -o /dev/null -w '%{http_code}' <liff_url>/settings` → `200`. Neon shows branch `pre-migrate-<sha>` and table `drizzle.__drizzle_migrations` with 1 row.
- [ ] **Step 6: Drift check.** Run `terraform plan`. Expected: `No changes.` (image ignore works).
- [ ] **Step 7: Latency check.** Run `curl -w '%{time_total}'` five times each against `<api_url>/health` (warm) from Taiwan. Record the median in spec §12 #8 and mark the region confirmed. Mark #3 as Firebase Hosting. Commit `docs(spec): confirm region and LIFF hosting` in a follow-up PR or this PR if still open.
