#!/usr/bin/env bash
# Creates/updates the chat-secrets Secret from a .env file (default: repo root .env).
# Usage: scripts/create-secrets.sh [path/to/.env]
set -euo pipefail
ENV_FILE=${1:-"$(dirname "$0")/../.env"}
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a

: "${SMTP_HOST:?SMTP_HOST missing}" "${SMTP_USERNAME:?SMTP_USERNAME missing}" "${SMTP_PASSWORD:?SMTP_PASSWORD missing}"

kubectl get namespace chat >/dev/null 2>&1 || kubectl create namespace chat

# Keep the existing DB password if the secret already exists (changing it would lock out Postgres)
EXISTING_PG=$(kubectl -n chat get secret chat-secrets -o jsonpath='{.data.POSTGRES_PASSWORD}' 2>/dev/null | base64 -d || true)
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-${EXISTING_PG:-$(openssl rand -hex 16)}}

kubectl -n chat create secret generic chat-secrets \
  --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  --from-literal=JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}" \
  --from-literal=SMTP_HOST="$SMTP_HOST" \
  --from-literal=SMTP_PORT="${SMTP_PORT:-587}" \
  --from-literal=SMTP_USERNAME="$SMTP_USERNAME" \
  --from-literal=SMTP_PASSWORD="$SMTP_PASSWORD" \
  --from-literal=SMTP_FROM="${SMTP_FROM:-$SMTP_USERNAME}" \
  --dry-run=client -o yaml | kubectl apply -f -
