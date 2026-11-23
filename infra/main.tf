data "google_project" "this" {
  project_id = var.project_id
}

locals {
  environments = toset(["staging", "prod"])

  # Names are computed here (not read from resources) so the Cloud Run env var
  # and the bucket's CORS (which needs the service URL) don't form a cycle.
  jobs_bucket = { for env in local.environments : env => "${var.project_id}-jobs-${env}" }

  pool_path = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}"

  # Who may impersonate each deployer: staging = pushes to main,
  # prod = release tags v* (see attribute.is_release mapping below).
  deployer_principal = {
    staging = "${local.pool_path}/attribute.ref/refs/heads/main"
    prod    = "${local.pool_path}/attribute.is_release/true"
  }
}

# ---------------------------------------------------------------------------
# Artifact Registry
# ---------------------------------------------------------------------------
resource "google_artifact_registry_repository" "containers" {
  location      = var.region
  repository_id = "instapdf"
  format        = "DOCKER"
  description   = "InstaPDF container images (tagged with git sha; releases also with v*)."

  cleanup_policy_dry_run = false

  # Storage is the only idle cost here. KEEP wins over DELETE:
  # keep every release (tag v*), keep the 10 most recent versions,
  # delete anything else older than 7 days.
  cleanup_policies {
    id     = "keep-releases"
    action = "KEEP"
    condition {
      tag_state    = "TAGGED"
      tag_prefixes = ["v"]
    }
  }

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
# Jobs buckets (temporary user files for server-side tools), one per env
# ---------------------------------------------------------------------------
resource "google_storage_bucket" "jobs" {
  for_each = local.environments

  name     = local.jobs_bucket[each.key]
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = true

  # User files must not linger: no 7-day soft-delete copy.
  soft_delete_policy {
    retention_duration_seconds = 0
  }

  # BACKSTOP ONLY. GCS lifecycle ages are whole days (minimum 1), so this
  # deletes objects after >= 1 day, not 2 hours. Nothing writes here yet.
  # The <= 2 h guarantee must come from a scale-to-zero cleaner (Cloud
  # Scheduler every 15 min -> authenticated cleanup endpoint on the worker,
  # or a per-upload Cloud Tasks delete) that MUST ship with F6 (server
  # worker) before any upload code goes live.
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

  # Browser uploads/downloads via signed URLs, from this env's web origin only.
  cors {
    origin          = concat([google_cloud_run_v2_service.web[each.key].uri], var.extra_cors_origins[each.key])
    method          = ["GET", "PUT", "HEAD"]
    response_header = ["Content-Type", "Content-Length", "Content-Disposition"]
    max_age_seconds = 3600
  }
}

# ---------------------------------------------------------------------------
# Runtime identity, one per env
# ---------------------------------------------------------------------------
resource "google_service_account" "web_runtime" {
  for_each = local.environments

  account_id   = "web-runtime-${each.key}"
  display_name = "InstaPDF web ${each.key} (Cloud Run runtime)"
}

# Least privilege: object access on this env's jobs bucket only.
resource "google_storage_bucket_iam_member" "web_runtime_jobs" {
  for_each = local.environments

  bucket = google_storage_bucket.jobs[each.key].name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.web_runtime[each.key].email}"
}

# V4 signed URLs from Cloud Run have no private key: the SA signs via
# iamcredentials signBlob on itself.
resource "google_service_account_iam_member" "web_runtime_self_sign" {
  for_each = local.environments

  service_account_id = google_service_account.web_runtime[each.key].name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.web_runtime[each.key].email}"
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
    service_account                  = google_service_account.web_runtime[each.key].email
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

      # Set at creation. CI adds APP_VERSION with --update-env-vars, so env is
      # ignored below; see infra/README.md for changing these later.
      env {
        name  = "APP_ENV"
        value = each.key
      }
      env {
        name  = "JOBS_BUCKET"
        value = local.jobs_bucket[each.key]
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
    # CI deploys own the image, revision name and APP_VERSION; rollbacks own
    # traffic. Terraform never sets revision/labels/annotations, so ignoring
    # them only suppresses drift from gcloud.
    ignore_changes = [
      template[0].containers[0].image,
      template[0].containers[0].env,
      template[0].revision,
      template[0].labels,
      template[0].annotations,
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
    "google.subject"                = "assertion.sub"
    "attribute.repository"          = "assertion.repository"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
    "attribute.ref"                 = "assertion.ref"
    # principalSet can't match a prefix, so derive a boolean for release tags.
    "attribute.is_release" = "assertion.ref.startsWith(\"refs/tags/v\") ? \"true\" : \"false\""
  }

  # Numeric ids survive repo renames/transfers and can't be squatted.
  # Only main and release tags can get a token at all.
  attribute_condition = join(" && ", [
    "assertion.repository_id == \"${var.github_repository_id}\"",
    "assertion.repository_owner_id == \"${var.github_owner_id}\"",
    "(assertion.ref == \"refs/heads/main\" || assertion.ref.startsWith(\"refs/tags/v\"))",
  ])

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  for_each = local.environments

  account_id   = "gh-deploy-${each.key}"
  display_name = "GitHub Actions deployer (${each.key})"
}

resource "google_service_account_iam_member" "deployer_wif" {
  for_each = local.environments

  service_account_id = google_service_account.deployer[each.key].name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.deployer_principal[each.key]
}

# Deploy revisions and shift traffic on this env's service only.
resource "google_cloud_run_v2_service_iam_member" "deployer_run" {
  for_each = local.environments

  name     = google_cloud_run_v2_service.web[each.key].name
  location = google_cloud_run_v2_service.web[each.key].location
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.deployer[each.key].email}"
}

# Read-only project view so gcloud can poll operations and list revisions.
resource "google_project_iam_member" "deployer_run_viewer" {
  for_each = local.environments

  project = var.project_id
  role    = "roles/run.viewer"
  member  = "serviceAccount:${google_service_account.deployer[each.key].email}"
}

# Staging pushes images; prod adds release tags. Scoped to the one repository.
resource "google_artifact_registry_repository_iam_member" "deployer_push" {
  for_each = local.environments

  location   = google_artifact_registry_repository.containers.location
  repository = google_artifact_registry_repository.containers.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deployer[each.key].email}"
}

# Deploying a revision that runs as the env's runtime SA requires actAs on it only.
resource "google_service_account_iam_member" "deployer_acts_as_runtime" {
  for_each = local.environments

  service_account_id = google_service_account.web_runtime[each.key].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer[each.key].email}"
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
