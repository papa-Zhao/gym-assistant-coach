mock_provider "google" {}
mock_provider "google-beta" {}

variables {
  project_id      = "test-project"
  billing_account = "000000-000000-000000"
  alert_email     = "alerts@example.com"
}

run "scheduler" {
  command = plan

  override_resource {
    target          = google_service_account.scheduler_invoker
    override_during = plan
    values = {
      email = "scheduler-invoker@test-project.iam.gserviceaccount.com"
      name  = "projects/test-project/serviceAccounts/scheduler-invoker@test-project.iam.gserviceaccount.com"
    }
  }

  assert {
    condition     = google_cloud_scheduler_job.daily.schedule == "0 4 * * *" && google_cloud_scheduler_job.daily.time_zone == "Asia/Taipei"
    error_message = "Daily job must run at 04:00 Taipei time."
  }

  assert {
    condition = (
      google_cloud_scheduler_job.daily.http_target[0].http_method == "POST" &&
      endswith(google_cloud_scheduler_job.daily.http_target[0].uri, "/jobs/daily")
    )
    error_message = "Daily job must POST to the api's /jobs/daily."
  }

  assert {
    condition = (
      google_cloud_scheduler_job.daily.http_target[0].oidc_token[0].audience == "gac-api-internal" &&
      google_cloud_scheduler_job.daily.http_target[0].oidc_token[0].service_account_email == "scheduler-invoker@test-project.iam.gserviceaccount.com"
    )
    error_message = "Daily job must sign an OIDC token as scheduler-invoker for gac-api-internal."
  }

  assert {
    condition = anytrue([
      for e in google_cloud_run_v2_service.svc["api"].template[0].containers[0].env :
      e.name == "SCHEDULER_SA_EMAIL" && e.value == "scheduler-invoker@test-project.iam.gserviceaccount.com"
    ])
    error_message = "api SCHEDULER_SA_EMAIL must be the scheduler-invoker email."
  }
}
