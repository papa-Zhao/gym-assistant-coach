resource "google_artifact_registry_repository" "gac" {
  repository_id = "gac"
  location      = var.region
  format        = "DOCKER"
  description   = "Gym Assistant Coach container images"

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }

  cleanup_policies {
    id     = "delete-old-untagged"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s"
    }
  }

  depends_on = [google_project_service.enabled]
}
