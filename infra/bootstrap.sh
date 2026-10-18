#!/usr/bin/env bash
# One-time, idempotent project bootstrap. Usage: infra/bootstrap.sh <project-id>
set -euo pipefail

PROJECT_ID="${1:?usage: bootstrap.sh <project-id>}"
BILLING_ACCOUNT="01E664-BCA62E-9FC80C"
REGION="asia-southeast1"
STATE_BUCKET="${PROJECT_ID}-tfstate"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  echo "project $PROJECT_ID exists"
else
  gcloud projects create "$PROJECT_ID"
fi

gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"

gcloud services enable \
  serviceusage.googleapis.com \
  cloudresourcemanager.googleapis.com \
  storage.googleapis.com \
  billingbudgets.googleapis.com \
  --project="$PROJECT_ID"

if gcloud storage buckets describe "gs://${STATE_BUCKET}" >/dev/null 2>&1; then
  echo "bucket gs://${STATE_BUCKET} exists"
else
  gcloud storage buckets create "gs://${STATE_BUCKET}" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --uniform-bucket-level-access \
    --public-access-prevention
fi
gcloud storage buckets update "gs://${STATE_BUCKET}" --versioning

cat >"${DIR}/backend.hcl" <<HCL
bucket = "${STATE_BUCKET}"
prefix = "infra"
HCL
echo "wrote ${DIR}/backend.hcl"
