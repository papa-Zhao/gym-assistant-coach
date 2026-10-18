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
