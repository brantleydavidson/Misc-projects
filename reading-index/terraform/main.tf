# One Cloud Run service, one Cloud SQL Postgres instance (db-f1-micro),
# one private bucket, Secret Manager, and Cloud Scheduler.
# No Document AI, Vertex, Pub/Sub, or Workflows.
#
# The database has a public IPv4 address and zero authorized networks.
# Nothing can open a SQL connection to that address. Cloud Run reaches it
# through the Cloud SQL connector unix socket. db-f1-micro is the smallest
# shared-core tier (shared vCPU, 0.6 GB RAM).

locals {
  services = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
    "cloudscheduler.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
  ]
}

resource "google_project_service" "services" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "runtime" {
  account_id   = "reading-index"
  display_name = "reading-index Cloud Run runtime"
  depends_on   = [google_project_service.services]
}

resource "random_password" "db" {
  length  = 24
  special = false
}

resource "random_password" "save_token" {
  length  = 32
  special = false
}

resource "random_password" "mcp_token" {
  length  = 32
  special = false
}

resource "random_password" "optimize_token" {
  length  = 32
  special = false
}

resource "google_sql_database_instance" "postgres" {
  name                = "reading-index"
  database_version    = "POSTGRES_16"
  region              = var.region
  deletion_protection = true
  depends_on          = [google_project_service.services]

  settings {
    tier              = "db-f1-micro"
    edition           = "ENTERPRISE"
    availability_type = "ZONAL"
    disk_size         = 10
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    backup_configuration {
      enabled    = true
      start_time = "07:00"
    }

    ip_configuration {
      ipv4_enabled = true
      ssl_mode     = "ENCRYPTED_ONLY"
    }
  }
}

resource "google_sql_database" "reading" {
  name     = "reading_index"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "app" {
  name     = "reading_index"
  instance = google_sql_database_instance.postgres.name
  password = random_password.db.result
}

resource "google_storage_bucket" "originals" {
  name                        = "${var.project_id}-reading-index"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  depends_on                  = [google_project_service.services]

  versioning {
    enabled = true
  }
}

resource "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = "reading-index"
  format        = "DOCKER"
  description   = "reading-index images"
  depends_on    = [google_project_service.services]
}

resource "google_secret_manager_secret" "save_token" {
  secret_id = "reading-index-save-token"
  replication {
    auto {}
  }
  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret" "mcp_token" {
  secret_id = "reading-index-mcp-token"
  replication {
    auto {}
  }
  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret" "optimize_token" {
  secret_id = "reading-index-optimize-token"
  replication {
    auto {}
  }
  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret" "db_password" {
  secret_id = "reading-index-db-password"
  replication {
    auto {}
  }
  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret" "model_api_key" {
  secret_id = "reading-index-model-api-key"
  replication {
    auto {}
  }
  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret" "drive_credentials" {
  secret_id = "reading-index-drive-credentials"
  replication {
    auto {}
  }
  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "save_token" {
  secret      = google_secret_manager_secret.save_token.id
  secret_data = random_password.save_token.result
}

resource "google_secret_manager_secret_version" "mcp_token" {
  secret      = google_secret_manager_secret.mcp_token.id
  secret_data = random_password.mcp_token.result
}

resource "google_secret_manager_secret_version" "optimize_token" {
  secret      = google_secret_manager_secret.optimize_token.id
  secret_data = random_password.optimize_token.result
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db.result
}

resource "google_secret_manager_secret_version" "model_api_key" {
  secret      = google_secret_manager_secret.model_api_key.id
  secret_data = "unused"

  lifecycle {
    ignore_changes = [secret_data]
  }
}

resource "google_secret_manager_secret_iam_member" "save_token" {
  secret_id = google_secret_manager_secret.save_token.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "mcp_token" {
  secret_id = google_secret_manager_secret.mcp_token.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "optimize_token" {
  secret_id = google_secret_manager_secret.optimize_token.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "db_password" {
  secret_id = google_secret_manager_secret.db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "model_api_key" {
  secret_id = google_secret_manager_secret.model_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "drive_credentials" {
  secret_id = google_secret_manager_secret.drive_credentials.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_storage_bucket_iam_member" "objects" {
  bucket = google_storage_bucket.originals.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_cloud_run_v2_service" "app" {
  name     = "reading-index"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.runtime.email
    timeout         = "300s"

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.postgres.connection_name]
      }
    }

    containers {
      image = var.container_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      env {
        name  = "PORT"
        value = "8080"
      }
      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.originals.name
      }
      env {
        name  = "DB_USER"
        value = google_sql_user.app.name
      }
      env {
        name  = "DB_NAME"
        value = google_sql_database.reading.name
      }
      env {
        name  = "INSTANCE_CONNECTION_NAME"
        value = google_sql_database_instance.postgres.connection_name
      }
      env {
        name = "DB_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_password.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "SAVE_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.save_token.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "MCP_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.mcp_token.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "OPTIMIZE_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.optimize_token.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "MODEL_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.model_api_key.secret_id
            version = "latest"
          }
        }
      }

      dynamic "env" {
        for_each = var.enable_drive ? [1] : []
        content {
          name  = "DRIVE_FOLDER_ID"
          value = var.drive_folder_id
        }
      }

      dynamic "env" {
        for_each = var.enable_drive ? [1] : []
        content {
          name = "GOOGLE_CREDENTIALS_JSON"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.drive_credentials.secret_id
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 2
        period_seconds        = 5
        failure_threshold     = 12
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_iam_member.save_token,
    google_secret_manager_secret_iam_member.mcp_token,
    google_secret_manager_secret_iam_member.optimize_token,
    google_secret_manager_secret_iam_member.db_password,
    google_secret_manager_secret_iam_member.model_api_key,
    google_secret_manager_secret_iam_member.drive_credentials,
    google_secret_manager_secret_version.save_token,
    google_secret_manager_secret_version.mcp_token,
    google_secret_manager_secret_version.optimize_token,
    google_secret_manager_secret_version.db_password,
    google_secret_manager_secret_version.model_api_key,
    google_project_iam_member.sql_client,
    google_storage_bucket_iam_member.objects,
    google_sql_user.app,
    google_sql_database.reading,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_scheduler_job" "optimize" {
  name             = "reading-index-optimize"
  description      = "Bounded reading-index optimize pass"
  schedule         = var.optimize_schedule
  time_zone        = "Etc/UTC"
  region           = var.region
  attempt_deadline = "320s"
  depends_on       = [google_project_service.services]

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.app.uri}/internal/optimize"
    headers = {
      Authorization = "Bearer ${random_password.optimize_token.result}"
      Content-Type  = "application/json"
    }
    body = base64encode("{\"source\":\"scheduler\"}")
  }
}

resource "terraform_data" "drive_requirements" {
  lifecycle {
    precondition {
      condition     = !var.enable_drive || var.drive_folder_id != ""
      error_message = "Set drive_folder_id before enable_drive. The Drive secret also needs a version."
    }
  }
}
