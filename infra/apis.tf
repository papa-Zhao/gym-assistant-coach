locals {
  services = toset([
    "run",
    "artifactregistry",
    "secretmanager",
    "iam",
    "iamcredentials",
    "sts",
    "storage",
    "firebase",
    "firebasehosting",
    "billingbudgets",
    "cloudresourcemanager",
    "serviceusage",
  ])
}

resource "google_project_service" "enabled" {
  for_each = local.services

  service            = "${each.key}.googleapis.com"
  disable_on_destroy = false
}
