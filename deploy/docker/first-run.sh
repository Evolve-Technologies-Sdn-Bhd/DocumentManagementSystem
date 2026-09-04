#!/bin/bash
# ==========================================================================
# One-step quick start for fresh on-prem deployment (first run).
#
# Usage:
#   1. cp .env.example .env    and edit values (passwords, URLs, TLS mode, etc.)
#
#       For air-gapped / no-public-Internet on-prem deployments you probably
#       want to run the PKI generator first so users don't see browser warnings:
#
#          bash ./deploy/docker/generate-onprem-pki.sh
#          # then set in .env:
#          #   TLS_MODE=manual
#          #   TLS_CERT_FILE=/etc/caddy/tls/server-cert.pem
#          #   TLS_KEY_FILE=/etc/caddy/tls/server-key.pem
#
#   2. bash ./deploy/docker/first-run.sh
#
# This will:
#   - Build all images (backend ~ LibreOffice + Chromium, frontend, caddy)
#   - Start MySQL + wait healthy
#   - Start backend (runs migrations + optionally seeds)
#   - Start frontend (nginx, not exposed)
#   - Start Caddy on :80 + :443 (HTTPS auto per TLS_MODE)
# ==========================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"

if [ ! -f ".env" ]; then
  echo "[first-run] ERROR: .env not found at project root."
  echo "  Copy .env.example -> .env and edit secrets first."
  exit 1
fi

# Quick sanity: load TLS_MODE / DMS_PUBLIC_URLS for display
# shellcheck disable=SC1091
TLS_MODE_SHOW="$(grep -E '^TLS_MODE=' .env | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
HOSTS_SHOW="$(grep -E '^DMS_PUBLIC_URLS=' .env | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
FRONT_SHOW="$(grep -E '^FRONTEND_URL=' .env | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"

echo "[first-run] TLS_MODE        = ${TLS_MODE_SHOW:-auto}"
echo "[first-run] DMS_PUBLIC_URLS = ${HOSTS_SHOW:-dms.example.com}"
echo "[first-run] FRONTEND_URL    = ${FRONT_SHOW:-https://dms.example.com}"

if [ "${TLS_MODE_SHOW:-auto}" = "auto" ]; then
  echo "[first-run] ⚠  TLS_MODE=auto — expect Caddy to hit Let's Encrypt."
  echo "   Ensure: (a) ${HOSTS_SHOW:-dms.example.com} resolves via public DNS to THIS server,"
  echo "           (b) TCP ports 80 and 443 are OPEN on this host's firewall,"
  echo "           (c) ACME_EMAIL in .env is a real inbox (LE expiry notices go there)."
  echo "   If any of those are NOT true, use TLS_MODE=internal for testing or"
  echo "   TLS_MODE=manual + bash ./deploy/docker/generate-onprem-pki.sh for on-prem."
  read -r -p "Continue with TLS_MODE=auto? [y/N] " ANS
  if [ "${ANS}" != "y" ] && [ "${ANS}" != "Y" ]; then
    echo "[first-run] Aborted. Update .env TLS_MODE and re-run."
    exit 0
  fi
fi

echo "[first-run] Step 1/5: Building images (backend is big — LibreOffice + Chromium layers)..."
docker compose build

echo "[first-run] Step 2/5: Starting MySQL only (healthchecks gate backend boot)..."
docker compose up -d mysql

echo "[first-run] Step 3/5: Waiting for MySQL healthy..."
RETRIES=0
until docker compose ps --format json mysql 2>/dev/null | grep -q '"Health":"healthy"'; do
  echo -n "."
  RETRIES=$((RETRIES + 1))
  if [ "${RETRIES}" -gt 60 ]; then
    echo ""
    echo "[first-run] ERROR: MySQL did not become healthy in time."
    docker compose logs --tail=80 mysql
    exit 1
  fi
  sleep 3
done
echo ""
echo "[first-run] MySQL is healthy."

echo "[first-run] Step 4/5: Starting backend + frontend..."
echo "  Backend entrypoint will auto-run: Prisma migrate deploy + (if RUN_SEED=true) seed."
docker compose up -d backend frontend

echo "[first-run] Step 5/5: Starting Caddy (HTTPS reverse proxy)..."
docker compose up -d caddy

sleep 5
echo "[first-run] Final container status:"
docker compose ps

echo ""
echo "[first-run] Deployment complete."
echo ""
echo "  Backend log tail:   docker compose logs -f backend"
echo "  Caddy log tail:     docker compose logs -f caddy      (useful for TLS_MODE=auto ACME errors)"
echo "  All log tail:       docker compose logs -f"
echo ""
echo "  Reach DMS at:       ${FRONT_SHOW:-https://${HOSTS_SHOW:-dms.example.com}}"
echo ""
if [ "${TLS_MODE_SHOW:-auto}" = "internal" ]; then
  echo "  ⚠  TLS_MODE=internal: browsers will show UNTRUSTED CERT warnings until you"
  echo "     import Caddy's internal CA root. You can instead run:"
  echo "        bash ./deploy/docker/generate-onprem-pki.sh"
  echo "     and switch TLS_MODE=manual for long-term on-prem trust via GPO / MDM."
fi
if [ "${TLS_MODE_SHOW:-auto}" = "manual" ]; then
  echo "  ✅ TLS_MODE=manual: ensure server-cert.pem + server-key.pem exist in"
  echo "     ./deploy/docker/caddy/tls/ (re-run generate-onprem-pki.sh if needed)."
  echo "     Then distribute DMS-RootCA.pem/.p7b via GPO for domain machines."
fi
