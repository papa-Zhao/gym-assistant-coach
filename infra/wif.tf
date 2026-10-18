resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"

  depends_on = [google_project_service.enabled]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions"
  display_name                       = "GitHub Actions"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  attribute_condition = "assertion.repository == \"${var.github_repo}\" && assertion.ref == \"refs/heads/main\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "github_deployer" {
  account_id   = "github-deployer"
  display_name = "GitHub Actions deployer"

  depends_on = [google_project_service.enabled]
}

resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.github_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

locals {
  deployer_member = "serviceAccount:${google_service_account.github_deployer.email}"
}

resource "google_project_iam_member" "deployer_run_developer" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = local.deployer_member
}

resource "google_project_iam_member" "deployer_firebase_hosting" {
  project = var.project_id
  role    = "roles/firebasehosting.admin"
  member  = local.deployer_member
}

resource "google_service_account_iam_member" "deployer_act_as_runtime" {
  for_each = {
    api = google_service_account.api_runtime.name
    bot = google_service_account.bot_runtime.name
  }

  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = local.deployer_member
}

resource "google_artifact_registry_repository_iam_member" "deployer_writer" {
  project    = google_artifact_registry_repository.gac.project
  location   = google_artifact_registry_repository.gac.location
  repository = google_artifact_registry_repository.gac.name
  role       = "roles/artifactregistry.writer"
  member     = local.deployer_member
}

resource "google_secret_manager_secret_iam_member" "deployer_database_url" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = local.deployer_member
}
