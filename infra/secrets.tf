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
