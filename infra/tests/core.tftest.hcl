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

run "service_env" {
  command = plan

  assert {
    condition = anytrue([
      for e in google_cloud_run_v2_service.svc["api"].template[0].containers[0].env :
      e.name == "INTERNAL_AUDIENCE" && e.value == "gac-api-internal"
    ])
    error_message = "api must set INTERNAL_AUDIENCE to gac-api-internal."
  }

  assert {
    condition = anytrue([
      for e in google_cloud_run_v2_service.svc["api"].template[0].containers[0].env :
      e.name == "SESSION_SECRET" && anytrue([for v in e.value_source : anytrue([for k in v.secret_key_ref : k.secret == "api-session-secret" && k.version == "latest"])])
    ])
    error_message = "api SESSION_SECRET must come from the api-session-secret secret."
  }

  assert {
    condition = anytrue([
      for e in google_cloud_run_v2_service.svc["bot"].template[0].containers[0].env :
      e.name == "LINE_CHANNEL_SECRET" && anytrue([for v in e.value_source : anytrue([for k in v.secret_key_ref : k.secret == "line-channel-secret"])])
    ])
    error_message = "bot LINE_CHANNEL_SECRET must come from the line-channel-secret secret."
  }

  assert {
    condition = anytrue([
      for e in google_cloud_run_v2_service.svc["bot"].template[0].containers[0].env :
      e.name == "API_URL" && startswith(e.value, "https://api-")
    ])
    error_message = "bot API_URL must start with https://api-."
  }

  assert {
    condition = anytrue([
      for e in google_cloud_run_v2_service.svc["api"].template[0].containers[0].env :
      e.name == "CORS_ORIGIN" && e.value == "https://test-project-liff.web.app"
    ])
    error_message = "api CORS_ORIGIN must be the LIFF site origin without a trailing slash."
  }
}
