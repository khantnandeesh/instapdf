data "google_project" "this" {
  project_id = var.project_id
}

locals {
  environments = toset(["staging", "prod"])
  jobs_bucket  = "${var.project_id}-jobs"
}

# ---------------------------------------------------------------------------
# Artifact Registry
# ---------------------------------------------------------------------------
resource "google_artifact_registry_repository" "containers" {
  location      = var.region
  repository_id = "instapdf"
  format        = "DOCKER"
  description   = "InstaPDF container images (tagged with git sha)."

  cleanup_policy_dry_run = false

  # Storage is the only idle cost here: keep the 10 most recent versions,
  # delete anything else older than 7 days. KEEP wins over DELETE.
  cleanup_policies {
    id     = "keep-recent-10"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }

  cleanup_policies {
    id     = "delete-older-than-7d"
    action = "DELETE"
    condition {
      tag_state  = "ANY"
      older_than = "604800s"
    }
  }
}

# ---------------------------------------------------------------------------
# Jobs bucket (temporary user files for server-side tools)
# ---------------------------------------------------------------------------
resource "google_storage_bucket" "jobs" {
  name     = local.jobs_bucket
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = true

  # User files must not linger: no 7-day soft-delete copy.
  soft_delete_policy {
    retention_duration_seconds = 0
  }

  # The app deletes job files 2 hours after upload. GCS lifecycle rules work
  # in whole days (minimum age = 1), so this is the backstop, not the SLA.
  lifecycle_rule {
    condition {
      age = 1
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      age = 1
    }
    action {
      type = "AbortIncompleteMultipartUpload"
    }
  }

  # Browser uploads/downloads via signed URLs, from our web origins only.
  cors {
    origin          = concat([for s in google_cloud_run_v2_service.web : s.uri], var.extra_cors_origins)
    method          = ["GET", "PUT", "HEAD"]
    response_header = ["Content-Type", "Content-Length", "Content-Disposition"]
    max_age_seconds = 3600
  }
}

# ---------------------------------------------------------------------------
# Runtime identity for the web services
# ---------------------------------------------------------------------------
resource "google_service_account" "web_runtime" {
  account_id   = "web-runtime"
  display_name = "InstaPDF web (Cloud Run runtime)"
}

# Least privilege: object access on the jobs bucket only, nothing project-wide.
resource "google_storage_bucket_iam_member" "web_runtime_jobs" {
  bucket = google_storage_bucket.jobs.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.web_runtime.email}"
}

# ---------------------------------------------------------------------------
# Cloud Run: web-staging, web-prod
# ---------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "web" {
  for_each = local.environments

  name                = "web-${each.key}"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = each.key == "prod"

  template {
    service_account                  = google_service_account.web_runtime.email
    max_instance_request_concurrency = 80
    timeout                          = "60s"

    scaling {
      min_instance_count = 0 # scale to zero: no idle cost
      max_instance_count = var.web_max_instances[each.key]
    }

    containers {
      # Placeholder; CI deploys own the real image (see ignore_changes).
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true # CPU only during requests (request-based billing)
        startup_cpu_boost = false
      }

      env {
        name  = "APP_ENV"
        value = each.key
      }
      env {
        name  = "JOBS_BUCKET"
        value = local.jobs_bucket
      }

      startup_probe {
        http_get {
          path = "/api/health"
        }
        initial_delay_seconds = 0
        period_seconds        = 3
        timeout_seconds       = 2
        failure_threshold     = 10
      }
    }
  }

  lifecycle {
    # Deploys (image) and rollbacks (traffic) are done by CI / gcloud.
    ignore_changes = [
      template[0].containers[0].image,
      traffic,
      client,
      client_version,
    ]
  }
}

resource "google_cloud_run_v2_service_iam_member" "web_public" {
  for_each = google_cloud_run_v2_service.web

  name     = each.value.name
  location = each.value.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ---------------------------------------------------------------------------
# GitHub Actions -> GCP via Workload Identity Federation (no keys)
# ---------------------------------------------------------------------------
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
    "attribute.actor"      = "assertion.actor"
  }

  # Only tokens minted for this repository are accepted at all.
  attribute_condition = "assertion.repository == \"${var.github_repo}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  account_id   = "gh-deployer"
  display_name = "GitHub Actions deployer"
}

resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

# Deploy revisions and shift traffic. run.developer covers deploy and
# update-traffic; run.admin is only needed to change IAM policy, which
# Terraform (not CI) owns.
resource "google_project_iam_member" "deployer_run" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Push images: scoped to the one repository, not project-wide.
resource "google_artifact_registry_repository_iam_member" "deployer_push" {
  location   = google_artifact_registry_repository.containers.location
  repository = google_artifact_registry_repository.containers.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deployer.email}"
}

# Deploying a revision that runs as web-runtime requires actAs on that SA only.
resource "google_service_account_iam_member" "deployer_acts_as_runtime" {
  service_account_id = google_service_account.web_runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# ---------------------------------------------------------------------------
# Budget: INR 1000/month, alerts at 50/80/100%
# ---------------------------------------------------------------------------
resource "google_billing_budget" "monthly" {
  count = var.billing_account_id == "" ? 0 : 1

  billing_account = var.billing_account_id
  display_name    = "instapdf-monthly-inr-${var.budget_inr}"

  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
  }

  amount {
    specified_amount {
      currency_code = "INR"
      units         = tostring(var.budget_inr)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.8
  }
  threshold_rules {
    threshold_percent = 1.0
  }
  # Early warning before the money is actually spent.
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }
}
