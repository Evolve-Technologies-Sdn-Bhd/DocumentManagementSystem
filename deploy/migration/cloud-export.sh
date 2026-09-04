#!/usr/bin/env bash
# ==========================================================================
# HUAWEI CLOUD aaPanel SERVER (159.138.233.253) — LIVE MIGRATION STEP A
#
# Run this AS ROOT ON THE aaPanel CLOUD SERVER to create ONE single
# compressed "migration bundle" containing:
#   1. Full MySQL dump  (dms database, utf8mb4, compressed)
#   2. backend/uploads/ (all uploaded documents, templates, avatars, ...)
#   3. backend/backups/ (DMS app-level backup zips)
#   4. backend/.env     (passwords, JWT secret, encryption key — carry over!)
#
# The bundle is saved to /root/dms-migration/dms-migration-<TS>.tar.gz
# and its SHA256 is written next to it for integrity verification.
#
# How to run:
#   Option A — upload this file via aaPanel file manager → then SSH:
#       sudo bash /root/dms-cloud-export.sh
#
#   Option B — pipe from your workstation 172.19.0.86 via SSH:
#       ssh root@159.138.233.253 'bash -s' < deploy/migration/cloud-export.sh
#
# Optional env vars you can override before running:
#   MYSQL_USER=root            (aaPanel default is usually root)
#   MYSQL_PASS=xxxx            (default: read from /www/server/panel/default.pl or prompt)
#   MYSQL_HOST=127.0.0.1
#   MYSQL_PORT=3306
#   DMS_DB_NAME=dms_prod       (edit if your aaPanel DB name is different)
#   DMS_BACKEND_DIR=/www/wwwroot/dms/backend
# ==========================================================================
set -euo pipefail

export LC_ALL=C
umask 077

ME="$(whoami)"
if [ "${ME}" != "root" ]; then
    echo "[cloud-export] ❌ Must run as root (su - root / sudo -i first)." >&2
    exit 1
fi

TS="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="/root/dms-migration"
BUNDLE_NAME="dms-migration-${TS}"
BUNDLE_DIR="${OUT_DIR}/${BUNDLE_NAME}"
BUNDLE_FILE="${OUT_DIR}/${BUNDLE_NAME}.tar.gz"
BUNDLE_SHA="${OUT_DIR}/${BUNDLE_NAME}.sha256"
mkdir -p "${BUNDLE_DIR}" "${BUNDLE_DIR}/db" "${BUNDLE_DIR}/data"

# ---- 1. Resolve MySQL credentials for this aaPanel install -----------------
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
DMS_DB_NAME="${DMS_DB_NAME:-}"

# Try to auto-extract password from common aaPanel locations
if [ -z "${MYSQL_PASS:-}" ] && [ -f /www/server/panel/default.pl ]; then
    MP="$(cat /www/server/panel/default.pl 2>/dev/null || true)"
    [ -n "${MP}" ] && export MYSQL_PASS="${MP}"
fi
if [ -z "${MYSQL_PASS:-}" ] && [ -f /www/server/panel/data/default.db ]; then
    MP="$(sqlite3 /www/server/panel/data/default.db 'SELECT mysql_root FROM config;' 2>/dev/null || true)"
    [ -n "${MP}" ] && export MYSQL_PASS="${MP}"
fi
if [ -z "${MYSQL_PASS:-}" ]; then
    read -r -s -p "[cloud-export] MySQL password for user '${MYSQL_USER}': " MYSQL_PASS
    echo ""
    export MYSQL_PASS
fi

# Try to detect DMS DB name automatically
if [ -z "${DMS_DB_NAME}" ]; then
    echo "[cloud-export] Trying to auto-detect DMS database name..."
    ALL_DBS="$(MYSQL_PWD="${MYSQL_PASS}" mysql -u"${MYSQL_USER}" -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -N -B -e "SHOW DATABASES;" 2>/dev/null || true)"
    for cand in dms_prod dms_live dms_main dms dms_dev dms; do
        if echo "${ALL_DBS}" | grep -qx "${cand}"; then
            DMS_DB_NAME="${cand}"
            echo "[cloud-export] Auto-detected DB: ${DMS_DB_NAME}"
            break
        fi
    done
fi
if [ -z "${DMS_DB_NAME}" ]; then
    echo "[cloud-export] Available databases:"
    MYSQL_PWD="${MYSQL_PASS}" mysql -u"${MYSQL_USER}" -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -e "SHOW DATABASES;" || true
    read -r -p "[cloud-export] Enter exact DMS database name: " DMS_DB_NAME
fi
[ -z "${DMS_DB_NAME}" ] && { echo "[cloud-export] ❌ DB name empty." >&2; exit 2; }

# ---- 2. Locate DMS backend folder ------------------------------------------
DMS_BACKEND_DIR="${DMS_BACKEND_DIR:-}"
if [ -z "${DMS_BACKEND_DIR}" ]; then
    # Common aaPanel default paths + find by .env example
    for cand in \
        /www/wwwroot/dms/backend \
        /www/wwwroot/dms-live/backend \
        /www/wwwroot/document/backend \
        /www/wwwroot/default/backend; do
        if [ -d "${cand}" ] && [ -f "${cand}/src/index.js" ] && [ -f "${cand}/.env" ]; then
            DMS_BACKEND_DIR="${cand}"
            break
        fi
    done
    if [ -z "${DMS_BACKEND_DIR}" ]; then
        FOUND="$(find /www/wwwroot -maxdepth 5 -name index.js -path '*/backend/src/*' 2>/dev/null | head -1 || true)"
        if [ -n "${FOUND}" ]; then
            DMS_BACKEND_DIR="$(cd "$(dirname "${FOUND}")/.." && pwd)"
        fi
    fi
fi
if [ -z "${DMS_BACKEND_DIR}" ] || [ ! -d "${DMS_BACKEND_DIR}" ]; then
    echo "[cloud-export] Could not auto-locate DMS backend dir." >&2
    echo "   Searched: /www/wwwroot/dms/backend, /www/wwwroot/dms-live/backend ..." >&2
    read -r -p "[cloud-export] Enter full DMS backend dir path on this aaPanel server: " DMS_BACKEND_DIR
fi
[ -z "${DMS_BACKEND_DIR}" ] && { echo "[cloud-export] ❌ empty." >&2; exit 2; }
[ ! -d "${DMS_BACKEND_DIR}" ] && { echo "[cloud-export] ❌ No such dir: ${DMS_BACKEND_DIR}" >&2; exit 2; }
echo "[cloud-export] DMS backend directory: ${DMS_BACKEND_DIR}"

# ---- 3. Size estimation pre-check ------------------------------------------
UP_DIR="${DMS_BACKEND_DIR}/uploads"
BK_DIR="${DMS_BACKEND_DIR}/backups"
UP_SIZE_MB="0"
BK_SIZE_MB="0"
[ -d "${UP_DIR}" ] && UP_SIZE_MB="$(du -sm "${UP_DIR}" 2>/dev/null | cut -f1)"
[ -d "${BK_DIR}" ] && BK_SIZE_MB="$(du -sm "${BK_DIR}" 2>/dev/null | cut -f1)"
DB_SIZE_MB="$(MYSQL_PWD="${MYSQL_PASS}" mysql -u"${MYSQL_USER}" -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" -N -B -e "SELECT ROUND(SUM(data_length+index_length)/1024/1024) FROM information_schema.tables WHERE table_schema='${DMS_DB_NAME}';" 2>/dev/null || echo 0)"

echo "[cloud-export] === Size estimate ==="
echo "  DB (${DMS_DB_NAME}) : ${DB_SIZE_MB} MB"
echo "  uploads/          : ${UP_SIZE_MB} MB"
echo "  backups/          : ${BK_SIZE_MB} MB"
echo "  Total (uncompressed) : $((DB_SIZE_MB + UP_SIZE_MB + BK_SIZE_MB)) MB"
read -r -p "[cloud-export] Continue creating bundle? [y/N] " ANS
if [ "${ANS}" != "y" ] && [ "${ANS}" != "Y" ]; then
    echo "[cloud-export] Aborted."; exit 0
fi

# ---- 4. MySQL dump ---------------------------------------------------------
DUMP_FILE="${BUNDLE_DIR}/db/${DMS_DB_NAME}.sql.gz"
echo "[cloud-export] (1/4) Dumping MySQL database '${DMS_DB_NAME}' → ${DUMP_FILE}"
MYSQL_PWD="${MYSQL_PASS}" mysqldump \
    -u"${MYSQL_USER}" \
    -h"${MYSQL_HOST}" -P"${MYSQL_PORT}" \
    --default-character-set=utf8mb4 \
    --single-transaction \
    --routines --triggers --quick \
    --hex-blob \
    "${DMS_DB_NAME}" | gzip -9 > "${DUMP_FILE}"
echo "[cloud-export]   dump size: $(du -h "${DUMP_FILE}" | cut -f1)"

cat > "${BUNDLE_DIR}/db/migration-manifest.txt" <<EOF
TIMESTAMP=${TS}
SOURCE_HOSTNAME=$(hostname)
SOURCE_IP=159.138.233.253
MYSQL_USER=${MYSQL_USER}
MYSQL_HOST=${MYSQL_HOST}
MYSQL_PORT=${MYSQL_PORT}
DATABASE_NAME=${DMS_DB_NAME}
DUMP_FILE=db/${DMS_DB_NAME}.sql.gz
BACKEND_DIR=${DMS_BACKEND_DIR}
EOF

# ---- 5. Copy .env + uploads + backups --------------------------------------
echo "[cloud-export] (2/4) Copying backend/.env"
if [ -f "${DMS_BACKEND_DIR}/.env" ]; then
    cp -a "${DMS_BACKEND_DIR}/.env" "${BUNDLE_DIR}/data/backend.env"
else
    echo "[cloud-export]   ⚠ .env not found at ${DMS_BACKEND_DIR}/.env — you'll have to reconstruct .env manually on the on-prem side." >&2
fi

echo "[cloud-export] (3/4) Copying backend/uploads (${UP_SIZE_MB} MB)"
if [ -d "${UP_DIR}" ]; then
    cp -a "${UP_DIR}" "${BUNDLE_DIR}/data/uploads"
else
    echo "[cloud-export]   ⚠ uploads dir missing at ${UP_DIR}" >&2
fi

echo "[cloud-export] (4/4) Copying backend/backups (${BK_SIZE_MB} MB)"
if [ -d "${BK_DIR}" ]; then
    cp -a "${BK_DIR}" "${BUNDLE_DIR}/data/backups"
fi

# ---- 6. Tar + gzip + sha ---------------------------------------------------
echo "[cloud-export] Creating tar.gz bundle → ${BUNDLE_FILE}"
tar -I 'gzip -9' -cf "${BUNDLE_FILE}" -C "${OUT_DIR}" "${BUNDLE_NAME}"
SIZE_H="$(du -h "${BUNDLE_FILE}" | cut -f1)"

echo "[cloud-export] Writing SHA256 checksum → ${BUNDLE_SHA}"
( cd "${OUT_DIR}" && sha256sum "${BUNDLE_NAME}.tar.gz" > "${BUNDLE_NAME}.sha256" )

# ---- 7. Output transfer instructions --------------------------------------
echo ""
echo "===================================================================="
echo " ✅  CLOUD EXPORT DONE"
echo "===================================================================="
echo "  Bundle: ${BUNDLE_FILE}    (${SIZE_H})"
echo "  SHA   : ${BUNDLE_SHA}"
echo ""
echo " 📥  TRANSFER BUNDLE to ON-PREM SERVER 172.19.0.86 — pick ONE method:"
echo ""
echo "  Method 1) PUSH from cloud server to on-prem (run on 159.138.233.253):"
echo "      scp -P 22 '${BUNDLE_FILE}' '${BUNDLE_SHA}' dmsadmin@172.19.0.86:/home/dmsadmin/"
echo "      (note: 172.19.0.86 is a PRIVATE IP; reachable only if the cloud"
echo "             server has a site-to-site VPN / SD-WAN / leased line to the"
echo "             on-prem LAN. If not — use Method 2.)"
echo ""
echo "  Method 2) PULL from your WORKSTATION (172.19.0.86 is on your LAN):"
echo "      (a) First cloud → workstation — PowerShell:"
echo "          scp root@159.138.233.253:${BUNDLE_FILE} C:\\Users\\USER\\Downloads\\"
echo "          scp root@159.138.233.253:${BUNDLE_SHA}  C:\\Users\\USER\\Downloads\\"
echo "      (b) Then workstation → on-prem 172.19.0.86 via SCP:"
echo "          scp C:\\Users\\USER\\Downloads\\$(basename "${BUNDLE_FILE}") dmsadmin@172.19.0.86:/home/dmsadmin/"
echo "          scp C:\\Users\\USER\\Downloads\\$(basename "${BUNDLE_SHA}")  dmsadmin@172.19.0.86:/home/dmsadmin/"
echo ""
echo "  Method 3) Through aaPanel File Manager + download ZIP, upload via RDP/SFTP."
echo ""
echo " ⚠ CUTOVER (downtime starts): BEFORE running cloud-export.sh the 2nd time"
echo "   for the final (delta) sync, freeze the aaPanel app first:"
echo "       ssh root@159.138.233.253 'bash -s' < deploy/migration/cloud-freeze.sh on"
echo "   Then re-run THIS script for FINAL bundle, then cutover, then:"
echo "       ssh root@159.138.233.253 'bash -s' < deploy/migration/cloud-freeze.sh off"
echo "   (cloud app can be disabled permanently once on-prem smoke tests pass)."
echo "===================================================================="
