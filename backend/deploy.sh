#!/usr/bin/env bash
set -euo pipefail

# --- EDIT THESE if needed ---
PROJECT_ID="just-smithy-479012-a1"
REGION="us-east1"
SERVICE_ACCOUNT="vento-backend-sa@${PROJECT_ID}.iam.gserviceaccount.com"
CLOUDSQL_INSTANCE="${PROJECT_ID}:us-east1:vento-postgres"
BUCKET_NAME="vento_aureo_models"
SERVICE_NAME="vento-backend"
# ---------------------------

echo "[1/8] Setting project..."
gcloud config set project "${PROJECT_ID}"

echo "[2/8] Granting service account required roles..."
# cloudsql client
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/cloudsql.client" || true

# storage access for the bucket
gsutil iam ch "serviceAccount:${SERVICE_ACCOUNT}:objectViewer" "gs://${BUCKET_NAME}" || true

echo "[3/8] Create secret for DB password (if not exists)."
read -s -p "Enter DB password to store in Secret Manager (DB_PASS): " DB_PASS
echo
SECRET_NAME="vento-db-pass"
# Create (idempotent)
if ! gcloud secrets describe "${SECRET_NAME}" > /dev/null 2>&1; then
  printf "%s" "${DB_PASS}" | gcloud secrets create "${SECRET_NAME}" --data-file=- --replication-policy="automatic"
else
  printf "%s" "${DB_PASS}" | gcloud secrets versions add "${SECRET_NAME}" --data-file=-
fi

echo "[4/8] (Optional) Upload service account JSON to Secret Manager? (skip if using attached SA)"
read -p "Do you have a local SA JSON you want to upload? (y/N): " UP_SA
if [[ "${UP_SA,,}" == "y" ]]; then
  read -p "Path to SA JSON: " SA_PATH
  SA_SECRET="vento-backend-sa-json"
  if ! gcloud secrets describe "${SA_SECRET}" > /dev/null 2>&1; then
    gcloud secrets create "${SA_SECRET}" --replication-policy="automatic"
  fi
  gcloud secrets versions add "${SA_SECRET}" --data-file="${SA_PATH}"
  echo "Uploaded SA JSON to secret: ${SA_SECRET}"
fi

echo "[5/8] Deploying to Cloud Run (build from source in ./backend)..."
gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --source=./backend \
  --region="${REGION}" \
  --platform=managed \
  --service-account="${SERVICE_ACCOUNT}" \
  --add-cloudsql-instances="${CLOUDSQL_INSTANCE}" \
  --set-env-vars="BUCKET_NAME=${BUCKET_NAME},DB_USER=vento,DB_NAME=gold_experience,INSTANCE_CONNECTION_NAME=${CLOUDSQL_INSTANCE},MODEL_CACHE_DIR=/tmp/model_cache,MODEL_DIR=/var/models" \
  --update-secrets="DB_PASS=${SECRET_NAME}:latest" \
  --allow-unauthenticated \
  --timeout=300

echo "[6/8] Deployment finished. Fetching service URL..."
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --region="${REGION}" --platform=managed --format="value(status.url)")
echo "Service URL: ${SERVICE_URL}"

echo "[7/8] Quick smoke tests (GET health and list_cities)..."
echo "Health:"
curl -s "${SERVICE_URL}/health" | jq || true
echo "List cities (may return empty if /var/models not mounted):"
curl -s "${SERVICE_URL}/api/get_forecast/list_cities" || true

echo "[8/8] Done. If you need upload endpoint for the big RF model, use:"
echo "curl -X POST -F \"file=@/path/to/rf_tuned.joblib\" ${SERVICE_URL}/api/upload_model"
