variable "project_id" {
  type        = string
  description = "GCP project id."
}

variable "region" {
  type        = string
  default     = "asia-southeast1"
  description = "Region for Cloud Run, Artifact Registry and GCS."
}

variable "billing_account" {
  type        = string
  description = "Billing account id (currency TWD)."
}

variable "github_repo" {
  type        = string
  default     = "papa-Zhao/gym-assistant-coach"
  description = "GitHub repository (owner/name) allowed to deploy."
}

variable "budget_amount_twd" {
  type        = number
  default     = 1000
  description = "Monthly budget in TWD."
}
