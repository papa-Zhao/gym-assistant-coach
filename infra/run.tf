locals {
  run_services = {
    api = google_service_account.api_runtime.email
    bot = google_service_account.bot_runtime.email
  }

  # Fixed URL formats avoid a self-reference on the Cloud Run services.
  api_url         = "https://api-${data.google_project.this.number}.${var.region}.run.app"
  bot_url         = "https://bot-${data.google_project.this.number}.${var.region}.run.app"
  public_site_url = "https://${var.project_id}-liff.web.app"
  internal_aud    = "gac-api-internal"
  bot_aud         = "gac-bot-internal"

  # Plain values per service (secret_id values go through local.service_secret_env).
  service_env = {
    api = {
      INTERNAL_AUDIENCE     = local.internal_aud
      BOT_SA_EMAIL          = google_service_account.bot_runtime.email
      LINE_LOGIN_CHANNEL_ID = var.line_login_channel_id
      CORS_ORIGIN           = local.public_site_url
      BOT_URL               = local.bot_url
      BOT_AUDIENCE          = local.bot_aud
    }
    bot = {
      API_URL           = local.api_url
      INTERNAL_AUDIENCE = local.internal_aud
      LIFF_ID           = var.liff_id
      PUBLIC_SITE_URL   = local.public_site_url
      BOT_AUDIENCE      = local.bot_aud
      API_SA_EMAIL      = google_service_account.api_runtime.email
    }
  }

  # Env name => secret_id, resolved at version "latest".
  service_secret_env = {
    api = {
      DATABASE_URL   = google_secret_manager_secret.database_url.secret_id
      SESSION_SECRET = google_secret_manager_secret.api_session_secret.secret_id
    }
    bot = {
      LINE_CHANNEL_SECRET       = google_secret_manager_secret.line_channel_secret.secret_id
      LINE_CHANNEL_ACCESS_TOKEN = google_secret_manager_secret.line_channel_access_token.secret_id
    }
  }
}

# Placeholder image; CI deploys real images, so image drift is ignored.
resource "google_cloud_run_v2_service" "svc" {
  for_each = local.run_services

  name                = each.key
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = each.value

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      dynamic "env" {
        for_each = local.service_env[each.key]
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.service_secret_env[each.key]
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      resources {
        cpu_idle = true
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  # Secret access must exist before a revision that mounts the secrets starts.
  depends_on = [
    google_project_service.enabled,
    google_secret_manager_secret_iam_member.api_database_url,
    google_secret_manager_secret_iam_member.api_session_secret,
    google_secret_manager_secret_iam_member.bot_line_channel_secret,
    google_secret_manager_secret_iam_member.bot_line_channel_access_token,
    google_secret_manager_secret_version.api_session_secret,
  ]
}

# Public at the network layer: LIFF calls api, LINE calls bot. App-level auth arrives in PR 3.
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  for_each = google_cloud_run_v2_service.svc

  project  = each.value.project
  location = each.value.location
  name     = each.value.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
