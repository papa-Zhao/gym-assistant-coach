# Calls the api's daily job (purge deleted accounts, expired AI data) with an
# OIDC token; the api accepts only this service account on /jobs.
resource "google_service_account" "scheduler_invoker" {
  account_id   = "scheduler-invoker"
  display_name = "Cloud Scheduler invoker"

  depends_on = [google_project_service.enabled]
}

resource "google_cloud_scheduler_job" "daily" {
  name             = "daily"
  region           = var.region
  schedule         = "0 4 * * *"
  time_zone        = "Asia/Taipei"
  attempt_deadline = "300s"

  retry_config {
    retry_count = 1
  }

  http_target {
    http_method = "POST"
    uri         = "${local.api_url}/jobs/daily"

    oidc_token {
      service_account_email = google_service_account.scheduler_invoker.email
      audience              = local.internal_aud
    }
  }

  depends_on = [google_project_service.enabled]
}
