#!/usr/bin/env bash
# ==========================================================================
# ON-PREM SERVER (172.19.0.86) — APPLY MIGRATION BUNDLE
#
# Run this as dmsadmin (or any docker-group user) on 172.19.0.86 AFTER:
#   • server-bootstrap.sh was run (Docker + ufw installed)
#   • project folder exists at PROJECT_DIR (default /home/dmsadmin/DocumentManagementSystem)
#   • the bundle from cloud-export.sh was SCP'd into BUNDLE_DIR (default ~/)
#
# What it does:
#   1. Verifies SHA256 of bundle.
#   2. Extracts bundle into a temp dir.
#   3. Restores backend/.env values FROM THE CLOUD SERVER so you don't lose
#      JWT_SECRET / ENCRYPTION_KEY (otherwise old sessions + file encryption
#      would be permanently broken after migration).
#   4. Stops dms-backend container (it must NOT be running during volume
#      + DB restore to avoid corrupt half-applied writes).
#   5. Copies uploads/ and backups/ into the correct named docker volumes.
#   6. Starts mysql container only, drops DMS DB, recreates, imports dump.
#   7. Starts backend + frontend + caddy.
#   8. Runs smoke-test.sh (HTTPS, /api/system/health, /api/ai/config).
#
# Usage:
#   bash deploy/migration/onprem-apply.sh  ~/dms-migration-XXXXXXXX_XXXXXX.tar.gz
#
# Optional env vars:
#   PROJECT_DIR=/home/dmsadmin/DocumentManagementSystem
#   PRESERVE_ENV=false   (set true if you WANT to keep your on-prem .env
#                         and NOT import cloud JWT/enc keys — not recommended)
# ==========================================================================
set -euo pipefail

BUNDLE_FILE="${1:-}"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
PRESERVE_ENV="${PRESERVE_ENV:-false}"
VOLUME_PREFIX="${VOLUME_PREFIX:-}"     # compose sometimes prefixes volumes w/ project dir name
if [ -z "${VOLUME_PREFIX}" ]; then
    # Default guesses
    VOLUME_PREFIX="$(basename "${PROJECT_DIR}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]//g')"
fi

if [ -z "${BUNDLE_FILE}" ] || [ ! -f "${BUNDLE_FILE}" ]; then
    echo "Usage: $0 <path/to/dms-migration-YYYYMMDD_HHMMSS.tar.gz>" >&2
    echo ""
    echo "Example (after you SCP'd the bundle into /home/dmsadmin/):"
    echo "  cd ~/DocumentManagementSystem"
    echo "  bash deploy/migration/onprem-apply.sh /home/dmsadmin/dms-migration-20250904_120000.tar.gz"
    exit 2
fi

if [ ! -d "${PROJECT_DIR}" ] || [ ! -f "${PROJECT_DIR}/docker-compose.yml" ]; then
    echo "[onprem-apply] ❌ PROJECT_DIR must contain docker-compose.yml. Got: ${PROJECT_DIR}" >&2
    exit 3
fi
cd "${PROJECT_DIR}"

# 1) Verify SHA
BUNDLE_DIR_PATH="$(dirname "${BUNDLE_FILE}")"
BUNDLE_BASE="$(basename "${BUNDLE_FILE}")"
SHA_FILE="${BUNDLE_DIR_PATH}/${BUNDLE_BASE}.sha256"

echo "[onprem-apply] (1/8) Verifying SHA256..."
if [ -f "${SHA_FILE}" ]; then
    ( cd "${BUNDLE_DIR_PATH}" && sha256sum -c "${BUNDLE_BASE}.sha256" ) || {
        echo "[onprem-apply] ❌ SHA mismatch — bundle corrupted. Re-transfer the file from cloud." >&2
        exit 4
    }
    echo "[onprem-apply]   ✅ SHA OK."
else
    echo "[onprem-apply]   ⚠ No .sha256 found, skipping verification (file integrity not guaranteed)."
    read -r -p "Continue WITHOUT SHA verification? [y/N] " ANS
    [ "${ANS}" != "y" ] && [ "${ANS}" != "Y" ] && exit 0
fi

# 2) Extract
EXTRACT_DIR="$(mktemp -d -t dms-migrate-XXXXXX)"
trap 'rm -rf "${EXTRACT_DIR}"' EXIT
echo "[onprem-apply] (2/8) Extracting ${BUNDLE_BASE} → ${EXTRACT_DIR}"
tar -xzf "${BUNDLE_FILE}" -C "${EXTRACT_DIR}"
INNER_NAME="$(ls -1 "${EXTRACT_DIR}" | head -1)"
BUNDLE_ROOT="${EXTRACT_DIR}/${INNER_NAME}"
MANIFEST="${BUNDLE_ROOT}/db/migration-manifest.txt"
[ -f "${MANIFEST}" ] && { echo "[onprem-apply]   Manifest:"; sed 's/^/     /' "${MANIFEST}"; }

# 3) Restore cloud .env secrets into project .env
CLOUD_ENV="${BUNDLE_ROOT}/data/backend.env"
if [ -f "${CLOUD_ENV}" ] && [ "${PRESERVE_ENV}" != "true" ]; then
    echo "[onprem-apply] (3/8) Merging cloud secrets into project .env (keeps on-prem DB host=mysql, URLs, TLS settings)"

    if [ ! -f ".env" ]; then cp .env.example .env; fi
    # Save a backup
    cp .env ".env.pre-migrate.$(date +%s).bak"

    # Merge function: set value in .env only if key exists in CLOUD_ENV,
    # but never overwrite the *on-prem* network-configuration keys.
    KEEP_LOCAL="MYSQL_USER MYSQL_PASSWORD MYSQL_DATABASE MYSQL_ROOT_PASSWORD DATABASE_URL DMS_PUBLIC_URLS FRONTEND_URL CORS_ORIGIN TLS_MODE ACME_EMAIL TLS_CERT_FILE TLS_KEY_FILE"
    awk -v cloud="${CLOUD_ENV}" -v keep="${KEEP_LOCAL}" '
    BEGIN {
        n=split(keep, karr, " "); for (i=1;i<=n;i++) keepkey[karr[i]]=1
        while ((getline line < cloud) > 0) {
            if (line ~ /^#/ || line ~ /^[[:space:]]*$/) continue
            eq=index(line,"="); if (eq<=1) continue
            k=substr(line,1,eq-1); v=substr(line,eq+1)
            gsub(/^[[:space:]]+|[[:space:]]+$/,"",k)
            if (k in keepkey) continue
            # strip surrounding quotes if any
            if (v ~ /^".*"$/) v=substr(v,2,length(v)-2)
            else if (v ~ /^'"'"'.*'"'"'$/) v=substr(v,2,length(v)-2)
            cloudval[k]=v
        }
    }
    {
        orig=$0
        if ($0 ~ /^#/ || $0 ~ /^[[:space:]]*$/) { print orig; next }
        eq=index($0,"="); if (eq<=1) { print orig; next }
        k=substr($0,1,eq-1); v=substr($0,eq+1)
        gsub(/^[[:space:]]+|[[:space:]]+$/,"",k)
        if (k in cloudval) {
            # Quote the value if it contains special characters (safest: always quote strings with specials; keep bare for simple)
            nv=cloudval[k]
            if (nv ~ /[ !$&'"'"'();<>?\[\\\]^`{|}]/) {
                gsub(/\\/,"\\\\",nv); gsub(/"/,"\\\"",nv)
                printf "%s=\"%s\"\n", k, nv
            } else {
                printf "%s=%s\n", k, nv
            }
            next
        }
        print orig
    }
    END {
        # Append any cloud keys not yet present in .env
        for (k in cloudval) {
            if (!seen[k]) {
                nv=cloudval[k]
                if (nv ~ /[ !$&'"'"'();<>?\[\\\]^`{|}]/) {
                    gsub(/\\/,"\\\\",nv); gsub(/"/,"\\\"",nv)
                    printf "# (imported from Huawei Cloud 159.138.233.253)\n%s=\"%s\"\n", k, nv
                } else {
                    printf "# (imported from Huawei Cloud 159.138.233.253)\n%s=%s\n", k, nv
                }
            }
        }
    }' .env > .env.new
    mv .env.new .env

    echo "[onprem-apply]   ✅ Cloud secrets imported (JWT_SECRET, ENCRYPTION_KEY, AI keys, SMTP etc. preserved)."
    echo "[onprem-apply]   (Original on-prem DB/URL/TLS vars untouched.)"
else
    echo "[onprem-apply] (3/8) ⚠ No cloud .env or PRESERVE_ENV=true. On-prem .env used as-is."
    echo "   ⚠ IF YOU DO NOT REUSE THE SAME JWT_SECRET + ENCRYPTION_KEY from cloud,"
    echo "     ALL EXISTING USER SESSIONS WILL BE INVALID and ENCRYPTED files cannot be decrypted."
fi

# Load new .env values for DB name / user / password
MYSQL_DATABASE="$(grep -E '^MYSQL_DATABASE=' .env | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
MYSQL_USER="$(grep -E '^MYSQL_USER='       .env | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
MYSQL_PASSWORD="$(grep -E '^MYSQL_PASSWORD='   .env | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
MYSQL_ROOT_PASSWORD="$(grep -E '^MYSQL_ROOT_PASSWORD=' .env | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
[ -z "${MYSQL_DATABASE}" ] && { echo "[onprem-apply] ❌ .env missing MYSQL_DATABASE."; exit 5; }

# 4) Stop backend/frontend/caddy — don't accept writes during restore
echo "[onprem-apply] (4/8) Stopping backend/frontend/caddy (keep mysql if already up)..."
docker compose stop backend frontend caddy 2>/dev/null || true

# Ensure mysql is up (we need it for import — but only after volumes restored? order: uploads first, then DB)
echo "[onprem-apply]   Starting mysql container only..."
docker compose up -d mysql
# Wait healthy
echo "[onprem-apply]   Waiting for mysql healthy..."
for i in $(seq 1 50); do
    HS="$(docker compose ps --format json mysql 2>/dev/null | grep -oE '"Health":"[^"]+"' | cut -d'"' -f4 || echo starting)"
    [ "${HS}" = "healthy" ] && break
    printf "."; sleep 3
done
echo ""
[ "${HS}" != "healthy" ] && { echo "[onprem-apply] ❌ mysql not healthy. Logs:"; docker compose logs --tail=50 mysql; exit 6; }

# 5) Restore uploads + backups into named volumes
echo "[onprem-apply] (5/8) Restoring uploads/ + backups/ into docker volumes..."
UP_SRC="${BUNDLE_ROOT}/data/uploads"
BK_SRC="${BUNDLE_ROOT}/data/backups"
# Volume names — try base name, and prefixed name
try_restore() {
    local vol="$1"; local src="$2"; local human="$3"
    for v in "${vol}" "${VOLUME_PREFIX}_${vol}"; do
        if docker volume inspect "${v}" >/dev/null 2>&1; then
            echo "[onprem-apply]   Restoring ${human} → volume ${v}"
            if [ -d "${src}" ]; then
                docker run --rm \
                    -v "${v}:/target" \
                    -v "${src}:/src:ro" \
                    alpine sh -c "rm -rf /target/* ; cp -a /src/. /target/ && chown -R 1000:1000 /target 2>/dev/null || true"
            fi
            return 0
        fi
    done
    echo "[onprem-apply]   ⚠ Volume ${vol} not found. Creating..."
    docker volume create "${vol}" >/dev/null
    docker run --rm \
        -v "${vol}:/target" \
        -v "${src}:/src:ro" \
        alpine sh -c "cp -a /src/. /target/ 2>/dev/null || true"
    return 0
}
[ -d "${UP_SRC}" ] && try_restore dms_uploads "${UP_SRC}" "uploads"
[ -d "${BK_SRC}" ] && try_restore dms_backups "${BK_SRC}" "backups"

# 6) Import DB
DUMP_GZ="$(ls -1 "${BUNDLE_ROOT}"/db/*.sql.gz 2>/dev/null | head -1 || true)"
if [ -z "${DUMP_GZ}" ]; then
    echo "[onprem-apply] ❌ No db/*.sql.gz in bundle." >&2; exit 7
fi
echo "[onprem-apply] (6/8) Importing MySQL dump → schema '${MYSQL_DATABASE}'"
echo "[onprem-apply]   drop+create schema first..."
docker exec -i dms-mysql mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" \
    -e "DROP DATABASE IF EXISTS \`${MYSQL_DATABASE}\`; CREATE DATABASE \`${MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo "[onprem-apply]   piping gunzipped dump through docker exec mysql..."
gunzip -c "${DUMP_GZ}" | docker exec -i dms-mysql mysql -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}"
echo "[onprem-apply]   ✅ DB import done."

# 7) Start everything + rebuild images if first time
echo "[onprem-apply] (7/8) Starting full stack + rebuild backend/frontend if needed..."
docker compose up -d --build backend frontend caddy

echo "[onprem-apply]   Waiting 20s for backend boot..."
sleep 20

# 8) Smoke test
echo "[onprem-apply] (8/8) Running smoke tests..."
bash deploy/onprem/smoke-test.sh || true

echo ""
echo "===================================================================="
echo " ✅  ON-PREM MIGRATION APPLIED (159.138.233.253 → 172.19.0.86)"
echo "===================================================================="
echo ""
echo "  Next steps — CUTOVER:"
echo "   (a) From your workstation, browse the NEW on-prem URL:"
echo "       $(grep -E '^FRONTEND_URL=' .env | cut -d= -f2-)"
echo "       Log in with the SAME users/passwords as the cloud — everything matches."
echo "   (b) Run a few quick ops: upload a doc, approve it, download it, PDF render."
echo "   (c) When satisfied on-prem is 100% OK:"
echo "         • Change DNS (A record for your DMS domain → 172.19.0.86), OR"
echo "         • Tell users to bookmark: 172.19.0.86 / https://dms.corp.local"
echo "   (d) After 1-2 weeks running on-prem with no issues:"
echo "         ssh root@159.138.233.253 'bash cloud-freeze.sh off'   (only if you want aaPanel DMS back online temporarily)"
echo "         # Or simply shut down aaPanel DMS permanently + keep image backup."
echo "===================================================================="
