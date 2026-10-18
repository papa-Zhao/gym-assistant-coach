data "google_project" "this" {
  project_id = var.project_id
}

# Single TWD budget: 30% (~US$10) and 100% (~US$30) of NT$1,000, plus a forecast alert.
# Default IAM recipients are kept, so billing admins get the email alerts.
resource "google_billing_budget" "monthly" {
  billing_account = var.billing_account
  display_name    = "gym-assistant-coach monthly"

  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
  }

  amount {
    specified_amount {
      currency_code = "TWD"
      units         = tostring(var.budget_amount_twd)
    }
  }

  threshold_rules {
    threshold_percent = 0.3
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  depends_on = [google_project_service.enabled]
}
