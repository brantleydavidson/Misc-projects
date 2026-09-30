#!/usr/bin/env bash
# Build the container and apply Terraform. Refuses to run unless gcloud is
# authenticated and a project id is available. This script was not run in the
# environment that added the service: gcloud was not installed there.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is not installed. No deploy was attempted." >&2
  exit 1
fi

ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' || true)"
if [[ -z "${ACCOUNT}" ]]; then
  echo "gcloud is not authenticated. No deploy was attempted." >&2
  exit 1
fi

PROJECT="${1:-${GOOGLE_CLOUD_PROJECT:-}}"
if [[ -z "${PROJECT}" ]]; then
  PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
fi
if [[ -z "${PROJECT}" || "${PROJECT}" == "(unset)" ]]; then
  echo "No GCP project configured. Pass a project id. No deploy was attempted." >&2
  exit 1
fi

REGION="${REGION:-us-central1}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/reading-index/app:latest"

echo "Project: ${PROJECT}"
echo "Image:   ${IMAGE}"

gcloud services enable artifactregistry.googleapis.com cloudbuild.googleapis.com --project "${PROJECT}"
gcloud artifacts repositories describe reading-index --location "${REGION}" --project "${PROJECT}" >/dev/null 2>&1 || \
  gcloud artifacts repositories create reading-index \
    --repository-format docker \
    --location "${REGION}" \
    --project "${PROJECT}"

gcloud builds submit "${ROOT}" --tag "${IMAGE}" --project "${PROJECT}"

terraform -chdir="${ROOT}/terraform" init
terraform -chdir="${ROOT}/terraform" apply \
  -var "project_id=${PROJECT}" \
  -var "region=${REGION}" \
  -var "container_image=${IMAGE}"
