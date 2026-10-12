#!/usr/bin/env bash
# Deploys the app to the current kubectl context.
# Usage: BACKEND_IMAGE=... FRONTEND_IMAGE=... scripts/deploy.sh [v1-direct|v2-pooled]
# Optional: RDS_ENDPOINT=<host> to use Amazon RDS instead of the in-cluster Postgres
#           ECR_REGISTRY=<acct>.dkr.ecr.<region>.amazonaws.com to refresh the ECR pull secret
set -euo pipefail
VARIANT=${1:-v1-direct}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
: "${BACKEND_IMAGE:?set BACKEND_IMAGE}" "${FRONTEND_IMAGE:?set FRONTEND_IMAGE}"
[ -d "$ROOT/k8s/overlays/$VARIANT" ] || { echo "Unknown variant $VARIANT"; exit 1; }
command -v kustomize >/dev/null || { echo "kustomize not found: https://kubectl.docs.kubernetes.io/installation/kustomize/"; exit 1; }

# Work on a copy so the repo files stay untouched
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cp -r "$ROOT/k8s" "$WORK/"
cd "$WORK/k8s/overlays/$VARIANT"

kustomize edit set image "chat-backend=$BACKEND_IMAGE" "chat-frontend=$FRONTEND_IMAGE"
if [ -n "${RDS_ENDPOINT:-}" ]; then
  if [ "$VARIANT" = v1-direct ]; then DB=$RDS_ENDPOINT; else DB=pgbouncer; fi
  kustomize edit add configmap chat-config --behavior=merge \
    --from-literal="POSTGRES_HOST=$RDS_ENDPOINT" --from-literal="DB_HOST=$DB" \
    --from-literal="DB_USER=${RDS_USERNAME:-chat}"
fi

kubectl get namespace chat >/dev/null 2>&1 || kubectl create namespace chat
kubectl -n chat get secret chat-secrets >/dev/null || { echo "Run scripts/create-secrets.sh first"; exit 1; }

if [ -n "${ECR_REGISTRY:-}" ]; then
  # ECR tokens expire after 12h, so refresh the pull secret on every deploy
  kubectl -n chat create secret docker-registry ecr-pull \
    --docker-server="$ECR_REGISTRY" --docker-username=AWS \
    --docker-password="$(aws ecr get-login-password)" \
    --dry-run=client -o yaml | kubectl apply -f -
fi

kubectl apply -k .
if [ "$VARIANT" = v1-direct ]; then
  # v1 has no pooler/cache: remove them if a previous v2 deploy left them running
  kubectl -n chat delete deployment,service pgbouncer redis --ignore-not-found
fi

kubectl -n chat rollout status statefulset/postgres --timeout=180s
kubectl -n chat rollout status deployment/backend --timeout=180s
kubectl -n chat rollout status deployment/frontend --timeout=180s
kubectl -n chat get pods,hpa,ingress
