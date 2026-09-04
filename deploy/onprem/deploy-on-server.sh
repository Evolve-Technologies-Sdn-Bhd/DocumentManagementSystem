#!/usr/bin/env bash
# ==========================================================================
# SERVER-SIDE deploy orchestrator.
# RUN THIS after push-from-workstation.sh (or git clone), FROM the on-prem
# server, INSIDE the project directory.
#
#   cd ~/DocumentManagementSystem
#   bash deploy/onprem/deploy-on-server.sh
#
# It does:
#   1. Copies .env.example -> .env if none exists, then reminds user to edit.
#   2. (Optional) Generates on-prem PKI (self-signed RootCA + SAN server cert)
#      — pick Yes if you chose TLS_MODE=manual in your .env.
#   3. Calls first-run.sh which does: build images → start MySQL → wait healthy
#      → start backend (migrate + optional seed) → start frontend → start Caddy.
#   4. Runs smoke tests.
# ==========================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"

if [ ! -f "docker-compose.yml" ]; then
    echo "[deploy-on-server] ❌ Must be run from the project root (where docker-compose.yml lives)." >&2
    exit 2
fi

# 1. .env
if [ ! -f ".env" ]; then
    echo "[deploy-on-server] .env not found — copying .env.example → .env"
    cp .env.example .env
    echo ""
    echo "===================================================================="
    echo " ⚠ You MUST edit .env NOW. At minimum change these 5 fields:"
    echo ""
    echo "   MYSQL_ROOT_PASSWORD=...   (strong, unique)"
    echo "   MYSQL_PASSWORD=...        (strong, unique)"
    echo "   JWT_SECRET=...            (long, random — e.g.: openssl rand -hex 32)"
    echo "   ENCRYPTION_KEY=...        (long, random)"
    echo ""
    echo "   DMS_PUBLIC_URLS=$(hostname -I 2>/dev/null | awk '{print $1}')"
    echo "   FRONTEND_URL=https://<your-domain-or-ip>"
    echo "   CORS_ORIGIN=https://<your-domain-or-ip>"
    echo "   TLS_MODE=manual           (recommended for on-prem — no Internet needed)"
    echo "   RUN_SEED=false            (false if you will import aaPanel dump)"
    echo ""
    echo " After editing .env, re-run:  bash deploy/onprem/deploy-on-server.sh"
    echo "===================================================================="
    exit 0
fi

# 2. PKI for TLS_MODE=manual
TLS_MODE_SHOW="$(grep -E '^TLS_MODE=' .env | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
if [ "${TLS_MODE_SHOW:-auto}" = "manual" ] && [ ! -f "deploy/docker/caddy/tls/server-cert.pem" ]; then
    echo "[deploy-on-server] TLS_MODE=manual but no server-cert.pem yet."
    read -r -p "Generate on-prem PKI (self-signed Root CA + SAN server cert) now? [Y/n] " ANS
    if [ "${ANS}" = "y" ] || [ "${ANS}" = "Y" ] || [ -z "${ANS}" ]; then
        bash deploy/docker/generate-onprem-pki.sh
    fi
fi

# 3. First run
echo "[deploy-on-server] Calling first-run.sh now..."
bash deploy/docker/first-run.sh

# 4. Smoke tests
echo ""
echo "[deploy-on-server] Running smoke tests..."
bash deploy/onprem/smoke-test.sh || true
