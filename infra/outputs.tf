output "service_urls" {
  description = "Cloud Run URLs per environment."
  value       = { for env, s in google_cloud_run_v2_service.web : env => s.uri }
}

output "wif_provider" {
  description = "Set as GitHub repo variable GCP_WIF_PROVIDER."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_sa_email" {
  description = "Set as GitHub repo variable GCP_DEPLOYER_SA."
  value       = google_service_account.deployer.email
}

output "artifact_registry_url" {
  description = "Docker repository URL (images: <this>/web:<git sha>)."
  value       = "${google_artifact_registry_repository.containers.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}"
}

output "jobs_bucket" {
  description = "Bucket for temporary job files."
  value       = google_storage_bucket.jobs.name
}
