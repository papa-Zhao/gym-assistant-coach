output "wif_provider" {
  value       = google_iam_workload_identity_pool_provider.github.name
  description = "Full WIF provider resource name for google-github-actions/auth."
}

output "deployer_sa_email" {
  value = google_service_account.github_deployer.email
}

output "api_url" {
  value = google_cloud_run_v2_service.svc["api"].uri
}

output "bot_url" {
  value = google_cloud_run_v2_service.svc["bot"].uri
}

output "registry" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.gac.repository_id}"
}

output "liff_url" {
  value = "https://${google_firebase_hosting_site.liff.site_id}.web.app"
}
