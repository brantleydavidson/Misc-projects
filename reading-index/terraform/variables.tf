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
  description = "Optional Drive folder id. When empty, the app finds or creates a folder named Reading in the user's My Drive."
  type        = string
  default     = ""
}

variable "enable_drive" {
  description = "Mount the user's Google authorized-user JSON from Secret Manager as DRIVE_CREDENTIALS_JSON. Add a secret version before setting this true."
  type        = bool
  default     = false
}
