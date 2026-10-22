mock_provider "google" {}
mock_provider "google-beta" {}

variables {
  project_id      = "test-project"
  billing_account = "000000-000000-000000"
  alert_email     = "alerts@example.com"
}

run "monitoring" {
  command = plan

  override_resource {
    target          = google_monitoring_notification_channel.email
    override_during = plan
    values = {
      id = "projects/test-project/notificationChannels/123"
    }
  }

  assert {
    condition     = google_monitoring_notification_channel.email.type == "email"
    error_message = "Notification channel must be email."
  }

  assert {
    condition     = google_monitoring_notification_channel.email.labels.email_address == "alerts@example.com"
    error_message = "Notification channel must send to var.alert_email."
  }

  assert {
    condition     = keys(google_monitoring_uptime_check_config.health) == ["api", "bot"]
    error_message = "There must be exactly one uptime check per service (api, bot)."
  }

  assert {
    condition = alltrue([
      for k, c in google_monitoring_uptime_check_config.health :
      c.http_check[0].path == "/health" && c.period == "900s" && c.timeout == "10s"
    ])
    error_message = "Uptime checks must hit /health every 900s with a 10s timeout."
  }

  assert {
    condition = alltrue([
      for k, c in google_monitoring_uptime_check_config.health :
      startswith(c.monitored_resource[0].labels.host, "${k}-") && endswith(c.monitored_resource[0].labels.host, ".run.app")
    ])
    error_message = "Uptime check host must be the service's run.app host."
  }

  assert {
    condition = alltrue([
      for k, c in google_monitoring_uptime_check_config.health :
      length(c.selected_regions) == 3 && c.content_matchers[0].content == "\"status\":\"ok\""
    ])
    error_message = "Uptime checks must run from 3 regions and match \"status\":\"ok\"."
  }

  assert {
    condition = alltrue([
      for k, m in google_logging_metric.errors :
      strcontains(m.filter, "severity>=ERROR") && strcontains(m.filter, "resource.labels.service_name=\"${k}\"")
    ])
    error_message = "Error log metrics must count ERROR logs of their own service."
  }

  assert {
    condition = (
      google_monitoring_alert_policy.latency["api"].conditions[0].condition_threshold[0].threshold_value == 20000 &&
      google_monitoring_alert_policy.latency["bot"].conditions[0].condition_threshold[0].threshold_value == 45000
    )
    error_message = "Latency thresholds must be api 20000 ms and bot 45000 ms."
  }

  assert {
    condition = alltrue([
      for k, p in google_monitoring_alert_policy.latency :
      p.conditions[0].condition_threshold[0].duration == "900s"
    ])
    error_message = "Latency alerts must require 900s above the threshold."
  }

  assert {
    condition = alltrue([
      for k, p in google_monitoring_alert_policy.errors :
      p.combiner == "OR" && length(p.conditions) == 2 && alltrue([
        for c in p.conditions : c.condition_threshold[0].threshold_value == 4
      ])
    ])
    error_message = "Error alerts must OR two conditions, each above 4."
  }

  assert {
    condition = alltrue([
      for p in concat(
        values(google_monitoring_alert_policy.uptime),
        values(google_monitoring_alert_policy.errors),
        values(google_monitoring_alert_policy.latency),
      ) :
      contains(p.notification_channels, "projects/test-project/notificationChannels/123")
    ]) && length(google_monitoring_alert_policy.uptime) + length(google_monitoring_alert_policy.errors) + length(google_monitoring_alert_policy.latency) == 6
    error_message = "All 6 alert policies must notify the email channel."
  }
}

run "invalid_alert_email" {
  command = plan

  variables {
    alert_email = "not-an-email"
  }

  expect_failures = [var.alert_email]
}
