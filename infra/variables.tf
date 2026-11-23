variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "Region for Cloud Run, Artifact Registry and the jobs bucket."
  type        = string
  default     = "us-central1"
}

variable "github_repo" {
  description = "owner/name of the only GitHub repository allowed to deploy via WIF."
  type        = string
  default     = "khantnandeesh/instapdf"
}

variable "billing_account_id" {
  description = "Billing account id (XXXXXX-XXXXXX-XXXXXX). Leave empty to skip creating the budget."
  type        = string
  default     = ""
}

variable "budget_inr" {
  description = "Monthly budget in INR. Must match the billing account currency."
  type        = number
  default     = 1000
}

variable "web_max_instances" {
  description = "Max Cloud Run instances per environment (cost ceiling)."
  type        = map(number)
  default = {
    staging = 3
    prod    = 5
  }
}

variable "extra_cors_origins" {
  description = "Origins allowed to PUT/GET on the jobs bucket besides the Cloud Run URLs (local dev, custom domain)."
  type        = list(string)
  default     = ["http://localhost:3000"]
}
