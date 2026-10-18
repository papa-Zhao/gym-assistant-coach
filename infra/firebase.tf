resource "google_firebase_project" "default" {
  provider = google-beta
  project  = var.project_id

  depends_on = [google_project_service.enabled]
}

resource "google_firebase_hosting_site" "liff" {
  provider = google-beta
  project  = google_firebase_project.default.project
  site_id  = "${var.project_id}-liff"
}
