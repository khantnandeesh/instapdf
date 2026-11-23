terraform {
  required_version = ">= 1.6"

  # Local state on purpose: this root only creates the bucket that holds the
  # main root's remote state. Its state file is tiny and can be re-imported.
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
}
