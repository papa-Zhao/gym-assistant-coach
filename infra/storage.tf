resource "google_storage_bucket" "meal_photos" {
  name                        = "${var.project_id}-meal-photos"
  location                    = var.region
  public_access_prevention    = "enforced"
  uniform_bucket_level_access = true

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 90
    }
  }

  soft_delete_policy {
    retention_duration_seconds = 0
  }

  depends_on = [google_project_service.enabled]
}

# V4 signed URLs need the api to signBlob as itself.
resource "google_service_account_iam_member" "api_sign_blob" {
  service_account_id = google_service_account.api_runtime.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.api_runtime.email}"
}
