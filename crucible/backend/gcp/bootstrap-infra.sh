#!/usr/bin/env bash
# Prepares GCP resources that Cloud Build does not create: APIs, Artifact Registry, VPC connector.
# Cloud SQL, DATABASE_URL secret, and model secrets must still be configured separately.
#
# Usage:
#   export PROJECT_ID=your-gcp-project
#   export REGION=us-central1   # optional
#   ./crucible/backend/gcp/bootstrap-infra.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID to your GCP project id}"
REGION="${REGION:-us-central1}"
CONNECTOR="${CONNECTOR:-crucible-serverless}"
NETWORK="${NETWORK:-default}"

gcloud config set project "$PROJECT_ID"

echo "Enabling APIs..."
gcloud services enable \
  sqladmin.googleapis.com \
  run.googleapis.com \
  vpcaccess.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  servicenetworking.googleapis.com

echo "Artifact Registry repository 'crucible' (${REGION})..."
if gcloud artifacts repositories describe crucible --location="${REGION}" &>/dev/null; then
  echo "  (already exists)"
else
  gcloud artifacts repositories create crucible \
    --repository-format=docker \
    --location="${REGION}" \
    --description="Crucible API + MCP images"
fi

echo "Serverless VPC connector '${CONNECTOR}'..."
if gcloud compute networks vpc-access connectors describe "${CONNECTOR}" --region="${REGION}" &>/dev/null; then
  echo "  (already exists)"
else
  gcloud compute networks vpc-access connectors create "${CONNECTOR}" \
    --network="${NETWORK}" \
    --region="${REGION}" \
    --range=10.8.0.0/28
fi

cat <<EOF

Done with bootstrap steps.

Next (manual — one-time per environment):
1. Create a Cloud SQL for PostgreSQL instance (e.g. name crucible-postgres) in ${REGION}.
   After it is up, connect with psql and run: CREATE EXTENSION IF NOT EXISTS vector;
2. Create Secret Manager secrets expected by cloudbuild.yaml (DATABASE_URL unix-socket URL for Cloud Run, model keys, etc.).
3. Align crucible/backend/cloudbuild.yaml substitutions (_CLOUD_SQL_INSTANCE, _VPC_CONNECTOR) with your instance and connector names.
4. From the repo root:

     gcloud builds submit --config crucible/backend/cloudbuild.yaml .

Cloud Build deploys two services from the same image:
  - crucible-api  — REST /v1 + legacy UI (scales to 20 instances by default)
  - crucible-mcp  — Streamable HTTP /mcp only (--max-instances=1 for in-memory MCP sessions)

Consumers use the crucible-mcp URL + /mcp; enterprises use crucible-api + /v1.

EOF
