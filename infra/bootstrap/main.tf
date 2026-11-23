locals {
  # Each API is here because a resource or workflow needs it. Keep it minimal.
  apis = toset([
    "serviceusage.googleapis.com",         # enabling the APIs below
    "cloudresourcemanager.googleapis.com", # project IAM bindings, project data source
    "iam.googleapis.com",                  # service accounts, WIF pool/provider
    "iamcredentials.googleapis.com",       # WIF: GitHub exchanges its token for SA access tokens
    "sts.googleapis.com",                  # WIF: security token service
    "storage.googleapis.com",              # state bucket + jobs bucket
    "artifactregistry.googleapis.com",     # container images
    "run.googleapis.com",                  # Cloud Run services
    "logging.googleapis.com",              # Cloud Run request/container logs
    "secretmanager.googleapis.com",        # worker secrets (Phase 1+)
    "firestore.googleapis.com",            # accounts + usage counters (Phase 1+)
    "billingbudgets.googleapis.com",       # the INR 1000 budget
    # cloudbuild.googleapis.com is intentionally omitted: images are built by
    # docker on the GitHub runner, so Cloud Build is never used.
  ])
}

resource "google_project_service" "apis" {
  for_each = local.apis

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_storage_bucket" "tfstate" {
  name     = "${var.project_id}-tfstate"
  project  = var.project_id
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  # Keep state history bounded: drop noncurrent versions beyond the last 10.
  lifecycle_rule {
    condition {
      num_newer_versions = 10
      with_state         = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.apis]
}
