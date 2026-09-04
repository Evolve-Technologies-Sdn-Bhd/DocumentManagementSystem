#!/usr/bin/env bash
# ==========================================================================
# Workstation-side uploader.
# RUN THIS FROM your workstation (WSL / Git Bash / macOS / Linux shell).
# If you use pure Windows PowerShell / CMD, see PowerShell example in guide
# (or use WinSCP / FileZilla — any SCP/SFTP client is fine).
#
# Usage:
#   bash deploy/onprem/push-from-workstation.sh  <SERVER-IP>
#   bash deploy/onprem/push-from-workstation.sh  <SERVER-IP>  dmsadmin
#   bash deploy/onprem/push-from-workstation.sh  <SERVER-IP>  dmsadmin  /opt/dms
#
# It uses rsync over ssh (fast delta uploads) to copy the whole project
# EXCLUDING node_modules, .env, uploads, build artifacts, and logs.
# ==========================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

SERVER_IP="${1:-}"
SERVER_USER="${2:-dmsadmin}"
REMOTE_DIR="${3:-/home/${SERVER_USER}/DocumentManagementSystem}"

if [ -z "${SERVER_IP}" ]; then
    echo "Usage: $0 <SERVER-IP> [SERVER_USER=dmsadmin] [REMOTE_DIR=/home/<user>/DocumentManagementSystem]"
    echo ""
    echo "Example (from your workstation 172.19.0.86 -> on-prem server 172.19.0.99):"
    echo "  bash deploy/onprem/push-from-workstation.sh 172.19.0.99 dmsadmin /opt/dms"
    exit 2
fi

if ! command -v rsync >/dev/null 2>&1; then
    echo "[push] rsync not found on this machine. On WSL/Ubuntu install with: sudo apt install -y rsync"
    echo "On Git Bash for Windows, rsync is typically bundled. Alternatively use SCP:"
    echo "  scp -r \"${PROJECT_ROOT}\" \"${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}\""
    exit 3
fi

echo "[push] Workstation project root : ${PROJECT_ROOT}"
echo "[push] Target server            : ${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}"
echo "[push] Will now rsync project (skipping node_modules / .env / logs / uploads ...)"
echo ""
read -r -p "Proceed? [y/N] " ANS
if [ "${ANS}" != "y" ] && [ "${ANS}" != "Y" ]; then
    echo "[push] Aborted."
    exit 0
fi

rsync -aH --partial --info=progress2 --human-readable \
    -e "ssh" \
    --exclude='.git/' \
    --exclude='**/node_modules/' \
    --exclude='.env' \
    --exclude='backend/.env' \
    --exclude='frontend/.env' \
    --exclude='frontend/.env.local' \
    --exclude='frontend/dist/' \
    --exclude='backend/uploads/' \
    --exclude='backend/backups/' \
    --exclude='backend/temp/' \
    --exclude='**/_*.log' \
    --exclude='**/__vite_*.log' \
    --exclude='**/build*.log' \
    --exclude='.idea/' \
    --exclude='.vscode/' \
    --exclude='deploy/onprem/old-mysql-dump*.sql.gz' \
    "${PROJECT_ROOT}/" \
    "${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}/"

echo ""
echo "[push] Transfer complete."
echo ""
echo "👉 Now SSH into server and deploy:"
echo "   ssh ${SERVER_USER}@${SERVER_IP}"
echo "   cd ${REMOTE_DIR}"
echo "   bash deploy/onprem/deploy-on-server.sh"
