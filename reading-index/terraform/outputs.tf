output "cloud_run_url" {
  description = "Public HTTPS origin for the capture page, /save, and /mcp."
  value       = google_cloud_run_v2_service.app.uri
}

output "sql_connection_name" {
  description = "Cloud SQL connection name used by the Cloud Run unix socket."
  value       = google_sql_database_instance.postgres.connection_name
}

output "sql_tier" {
  description = "Intended Cloud SQL size: smallest shared-core instance."
  value       = "db-f1-micro"
}

output "bucket" {
  value = google_storage_bucket.originals.name
}

output "save_token_secret" {
  value = google_secret_manager_secret.save_token.secret_id
}

output "mcp_token_secret" {
  value = google_secret_manager_secret.mcp_token.secret_id
}

output "optimize_token_secret" {
  value = google_secret_manager_secret.optimize_token.secret_id
}

output "database_password_secret" {
  value = google_secret_manager_secret.db_password.secret_id
}

output "drive_credentials_secret" {
  value = google_secret_manager_secret.drive_credentials.secret_id
}
