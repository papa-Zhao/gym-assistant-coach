#!/usr/bin/env bash
# Adds a new version of the anthropic-api-key secret. Usage: infra/scripts/set-anthropic-key.sh <project-id>
# The key is read silently and passed to gcloud over stdin only: never as an argument, env var or file.
set -euo pipefail

PROJECT_ID="${1:?usage: set-anthropic-key.sh <project-id>}"

read -rsp "Anthropic API key: " ANTHROPIC_KEY
echo

if [ -z "$ANTHROPIC_KEY" ]; then
  echo "empty key, aborting" >&2
  exit 1
fi

printf '%s' "$ANTHROPIC_KEY" | gcloud secrets versions add anthropic-api-key --project "$PROJECT_ID" --data-file=-
unset ANTHROPIC_KEY
echo "added a new version of anthropic-api-key"
