output "service_urls" {
  description = "Cloud Run URLs per environment."
  value       = { for env, s in google_cloud_run_v2_service.web : env => s.uri }
}

output "wif_provider" {
  description = "Set as GitHub repo variable GCP_WIF_PROVIDER."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_sa_emails" {
  description = "Set as GitHub repo variables GCP_DEPLOYER_SA_STAGING / GCP_DEPLOYER_SA_PROD."
  value       = { for env, sa in google_service_account.deployer : env => sa.email }
}

output "runtime_sa_emails" {
  description = "Cloud Run runtime service account per environment."
  value       = { for env, sa in google_service_account.web_runtime : env => sa.email }
}

output "artifact_registry_url" {
  description = "Docker repository URL (images: <this>/web:<git sha>, releases also :v*)."
  value       = "${google_artifact_registry_repository.containers.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}"
}

output "jobs_buckets" {
  description = "Bucket for temporary job files, per environment."
  value       = { for env, b in google_storage_bucket.jobs : env => b.name }
}
