#!/usr/bin/env bash
# Sign in as the Google user who should own the Reading PDFs.
# drive.file lets this app create a Reading folder and upload into it.
# openid and userinfo.email are included so application-default login
# does not drop the scopes gcloud requires.
set -euo pipefail

gcloud auth application-default login \
  --scopes="openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/drive.file"

CONFIG_DIR="$(gcloud info --format='value(config.paths.global_config_dir)')"
ADC="${CONFIG_DIR}/application_default_credentials.json"
echo "ADC JSON: ${ADC}"
