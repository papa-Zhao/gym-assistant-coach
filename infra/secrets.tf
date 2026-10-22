# The secret value (Neon connection string) is added by the user; no version is managed here.
resource "google_secret_manager_secret" "database_url" {
  secret_id = "database-url"

  replication {
    auto {}
  }

  depends_on = [google_project_service.enabled]
}

resource "google_service_account" "api_runtime" {
  account_id   = "api-runtime"
  display_name = "API runtime"

  depends_on = [google_project_service.enabled]
}

resource "google_service_account" "bot_runtime" {
  account_id   = "bot-runtime"
  display_name = "Bot runtime"

  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_iam_member" "api_database_url" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api_runtime.email}"
}

resource "google_storage_bucket_iam_member" "api_meal_photos" {
  bucket = google_storage_bucket.meal_photos.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api_runtime.email}"
}

# LINE credentials: values are added by the user (docs/line-setup.md); no version is managed here.
resource "google_secret_manager_secret" "line_channel_secret" {
  secret_id = "line-channel-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret" "line_channel_access_token" {
  secret_id = "line-channel-access-token"

  replication {
    auto {}
  }

  depends_on = [google_project_service.enabled]
}

# Session signing secret is generated here and never leaves Secret Manager / state.
resource "random_password" "api_session_secret" {
  length  = 48
  special = false
}

resource "google_secret_manager_secret" "api_session_secret" {
  secret_id = "api-session-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_version" "api_session_secret" {
  secret      = google_secret_manager_secret.api_session_secret.id
  secret_data = random_password.api_session_secret.result
}

resource "google_secret_manager_secret_iam_member" "api_session_secret" {
  secret_id = google_secret_manager_secret.api_session_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api_runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "bot_line_channel_secret" {
  secret_id = google_secret_manager_secret.line_channel_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.bot_runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "bot_line_channel_access_token" {
  secret_id = google_secret_manager_secret.line_channel_access_token.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.bot_runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "deployer_line_channel_access_token" {
  secret_id = google_secret_manager_secret.line_channel_access_token.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.github_deployer.email}"
}

# Anthropic API key: value is added by the user (scripts/set-anthropic-key.sh); no version is managed here.
resource "google_secret_manager_secret" "anthropic_api_key" {
  secret_id = "anthropic-api-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_iam_member" "api_anthropic_api_key" {
  secret_id = google_secret_manager_secret.anthropic_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api_runtime.email}"
}
