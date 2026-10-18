mock_provider "google" {}
mock_provider "google-beta" {}

variables {
  project_id      = "test-project"
  billing_account = "000000-000000-000000"
}

run "core" {
  command = plan

  assert {
    condition     = google_storage_bucket.meal_photos.public_access_prevention == "enforced"
    error_message = "Photo bucket must enforce public access prevention."
  }

  assert {
    condition     = google_storage_bucket.meal_photos.uniform_bucket_level_access == true
    error_message = "Photo bucket must use uniform bucket-level access."
  }

  assert {
    condition = anytrue([
      for r in google_storage_bucket.meal_photos.lifecycle_rule :
      anytrue([for a in r.action : a.type == "Delete"]) && anytrue([for c in r.condition : c.age == 90])
    ])
    error_message = "Photo bucket must delete objects after 90 days."
  }

  assert {
    condition = anytrue([
      for p in google_artifact_registry_repository.gac.cleanup_policies :
      p.action == "DELETE" && anytrue([for c in p.condition : c.tag_state == "ANY" && c.older_than == "2592000s"])
    ])
    error_message = "Registry must delete tagged images older than 30 days."
  }

  assert {
    condition     = google_storage_bucket.meal_photos.soft_delete_policy[0].retention_duration_seconds == 0
    error_message = "Soft delete must be disabled on the photo bucket."
  }

  assert {
    condition = alltrue([
      for s in [google_cloud_run_v2_service.svc["api"], google_cloud_run_v2_service.svc["bot"]] :
      s.template[0].scaling[0].min_instance_count == 0 && s.template[0].scaling[0].max_instance_count == 3
    ])
    error_message = "Cloud Run services must scale 0-3."
  }

  assert {
    condition = alltrue([
      for s in [google_cloud_run_v2_service.svc["api"], google_cloud_run_v2_service.svc["bot"]] :
      s.template[0].containers[0].resources[0].cpu_idle == true
    ])
    error_message = "Cloud Run CPU must be allocated only during requests."
  }

  assert {
    condition     = google_iam_workload_identity_pool_provider.github.attribute_condition == "assertion.repository == \"papa-Zhao/gym-assistant-coach\" && assertion.ref == \"refs/heads/main\""
    error_message = "WIF must be restricted to the main branch of the repo."
  }
}
