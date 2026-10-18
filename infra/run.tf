locals {
  run_services = {
    api = google_service_account.api_runtime.email
    bot = google_service_account.bot_runtime.email
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

  depends_on = [google_project_service.enabled]
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
