variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "Region for Cloud Run, Artifact Registry and the jobs bucket."
  type        = string
  default     = "us-central1"
}

variable "github_repository_id" {
  description = "Numeric id of the GitHub repo allowed to deploy via WIF (khantnandeesh/instapdf). Ids survive renames."
  type        = string
  default     = "1468806745"
}

variable "github_owner_id" {
  description = "Numeric id of the GitHub repo owner."
  type        = string
  default     = "148197396"
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
  description = "Per-env origins allowed on that env's jobs bucket besides its Cloud Run URL (local dev, custom domain)."
  type        = map(list(string))
  default = {
    staging = ["http://localhost:3000"]
    prod    = []
  }
}
