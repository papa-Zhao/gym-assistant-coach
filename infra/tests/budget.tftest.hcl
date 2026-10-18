mock_provider "google" {}
mock_provider "google-beta" {}

variables {
  project_id      = "test-project"
  billing_account = "000000-000000-000000"
}

run "budget" {
  command = plan

  assert {
    condition     = google_billing_budget.monthly.amount[0].specified_amount[0].currency_code == "TWD"
    error_message = "Budget must be denominated in TWD."
  }

  assert {
    condition     = google_billing_budget.monthly.amount[0].specified_amount[0].units == "1000"
    error_message = "Budget must be NT$1,000."
  }

  assert {
    condition = toset([
      for r in google_billing_budget.monthly.threshold_rules : "${r.threshold_percent}/${r.spend_basis}"
    ]) == toset(["0.3/CURRENT_SPEND", "1/CURRENT_SPEND", "1/FORECASTED_SPEND"]) && length(google_billing_budget.monthly.threshold_rules) == 3
    error_message = "Threshold rules must be exactly 30% and 100% current spend plus 100% forecast."
  }

  assert {
    condition     = google_billing_budget.monthly.budget_filter[0].projects == toset(["projects/${data.google_project.this.number}"])
    error_message = "Budget filter must be scoped to this project only."
  }
}

run "hosting" {
  command = plan

  assert {
    condition     = google_firebase_hosting_site.liff.site_id == "test-project-liff"
    error_message = "Hosting site id must be <project_id>-liff."
  }

  assert {
    condition     = output.liff_url == "https://test-project-liff.web.app"
    error_message = "liff_url must be the web.app URL of the site."
  }
}
