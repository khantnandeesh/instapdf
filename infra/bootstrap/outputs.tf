output "state_bucket" {
  description = "Pass to the main root: terraform init -backend-config=\"bucket=<this>\"."
  value       = google_storage_bucket.tfstate.name
}
