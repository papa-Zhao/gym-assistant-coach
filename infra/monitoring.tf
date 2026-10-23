# Uptime, error and latency alerts for the Cloud Run services, sent by email.
# Kept in its own file (with its own API enablement and variable) so it does
# not touch apis.tf or variables.tf.

variable "alert_email" {
  type        = string
  description = "Where alerts are emailed. Not in git: set TF_VAR_alert_email or infra/alert.auto.tfvars."

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email must be an email address."
  }
}

locals {
  service_hosts = {
    api = trimprefix(local.api_url, "https://")
    bot = trimprefix(local.bot_url, "https://")
  }

  # The AI paths are slow by design (meal photo ~20 s, bot replies wait on api).
  latency_p95_ms = {
    api = 20000
    bot = 45000
  }

  alert_docs = {
    api = "api 服務（Cloud Run `api`）出問題。先看 Cloud Run → api → Logs（篩選 severity>=ERROR），再打開 `/health` 確認服務有沒有回應。"
    bot = "bot 服務（Cloud Run `bot`，LINE webhook）出問題。先看 Cloud Run → bot → Logs（篩選 severity>=ERROR），再打開 `/health` 確認服務有沒有回應。bot 的 webhook 失敗也回 200，所以錯誤主要看 ERROR log。"
  }
}

resource "google_project_service" "monitoring" {
  for_each = toset(["monitoring", "logging"])

  service            = "${each.key}.googleapis.com"
  disable_on_destroy = false
}

resource "google_monitoring_notification_channel" "email" {
  display_name = "Gym Assistant Coach alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }

  depends_on = [google_project_service.monitoring]
}

# /health does not touch the database, so checks never wake Neon.
resource "google_monitoring_uptime_check_config" "health" {
  for_each = local.run_services

  display_name     = "${each.key} /health"
  period           = "900s"
  timeout          = "10s"
  selected_regions = ["ASIA_PACIFIC", "USA_OREGON", "EUROPE"]

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = local.service_hosts[each.key]
    }
  }

  content_matchers {
    content = "\"status\":\"ok\""
  }

  depends_on = [google_project_service.monitoring]
}

resource "google_logging_metric" "errors" {
  for_each = local.run_services

  name   = "${each.key}_error_logs"
  filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${each.key}\" AND severity>=ERROR"

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }

  depends_on = [google_project_service.monitoring]
}

# Alerts when 2 or more of the 3 regions fail (a single region's network
# trouble is not an outage).
resource "google_monitoring_alert_policy" "uptime" {
  for_each = local.run_services

  display_name          = "${each.key} uptime"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "${each.key} /health failing"

    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.health[each.key].uptime_check_id}\" AND resource.type=\"uptime_url\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "0s"

      aggregations {
        alignment_period     = "1200s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = local.alert_docs[each.key]
    mime_type = "text/markdown"
  }
}

# Traffic is small, so counts (more than 4 in 10 minutes) rather than rates.
resource "google_monitoring_alert_policy" "errors" {
  for_each = local.run_services

  display_name          = "${each.key} errors"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "${each.key} 5xx responses"

    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${each.key}\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 4
      duration        = "0s"

      aggregations {
        alignment_period     = "600s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  conditions {
    display_name = "${each.key} ERROR logs"

    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/${google_logging_metric.errors[each.key].name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 4
      duration        = "0s"

      aggregations {
        alignment_period     = "600s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = local.alert_docs[each.key]
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "latency" {
  for_each = local.run_services

  display_name          = "${each.key} p95 latency"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "${each.key} p95 above ${local.latency_p95_ms[each.key]} ms"

    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${each.key}\" AND metric.type=\"run.googleapis.com/request_latencies\""
      comparison      = "COMPARISON_GT"
      threshold_value = local.latency_p95_ms[each.key]
      duration        = "900s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_PERCENTILE_95"
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = local.alert_docs[each.key]
    mime_type = "text/markdown"
  }
}
