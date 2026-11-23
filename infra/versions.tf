terraform {
  required_version = ">= 1.6"

  # Bucket comes from the bootstrap root:
  #   terraform init -backend-config="bucket=<project_id>-tfstate"
  backend "gcs" {
    prefix = "instapdf/main"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region

  # The Billing Budgets API needs a quota project when called with
  # user or service-account credentials.
  user_project_override = true
  billing_project       = var.project_id
}
