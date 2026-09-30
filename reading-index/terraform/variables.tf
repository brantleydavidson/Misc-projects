variable "project_id" {
  description = "Existing GCP project id. Do not invent one; apply fails closed without it."
  type        = string
}

variable "region" {
  description = "Region for Cloud Run, Cloud SQL, the bucket, and Cloud Scheduler."
  type        = string
  default     = "us-central1"
}

variable "container_image" {
  description = "Image in Artifact Registry, for example REGION-docker.pkg.dev/PROJECT/reading-index/app:latest."
  type        = string
}

variable "optimize_schedule" {
  description = "Cron schedule for the bounded optimize pass."
  type        = string
  default     = "*/15 * * * *"
}

variable "drive_folder_id" {
  description = "Google Drive folder id shared with the upload service account. Empty skips Drive."
  type        = string
  default     = ""
}

variable "enable_drive" {
  description = "Mount Drive credentials from Secret Manager. Add a secret version before setting this true."
  type        = bool
  default     = false
}
