#!/bin/bash
# ==========================================================================
# Import a mysqldump (.sql or .sql.gz) INTO the Docker MySQL container.
#
# Usage:
#   ./deploy/docker/import-dump.sh ./path/to/dms-mysql-dump-XXXX.sql.gz
#
# IMPORTANT:
#   - Make sure the mysql container is running:  docker compose up -d mysql
#   - Do NOT run this while the backend container is running (stop it first).
#   - The existing database inside the container will be WIPED first.
# ==========================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DUMP_FILE="${1:-}"

if [ -z "${DUMP_FILE}" ] || [ ! -f "${DUMP_FILE}" ]; then
  echo "Usage: $0 <dump.sql|dump.sql.gz>"
  echo "Example: $0 ./dms-mysql-dump-20250101_120000.sql.gz"
  exit 1
fi

# Load .env so we know the credentials
set -a
# shellcheck disable=SC1091
source "${PROJECT_ROOT}/.env"
set +a

echo "[import] Target: mysql container, database: ${MYSQL_DATABASE}"
echo "[import] Source dump: ${DUMP_FILE}"
read -r -p "This will ERASE the current Docker MySQL DB. Continue? [y/N] " ANS
if [ "${ANS}" != "y" ] && [ "${ANS}" != "Y" ]; then
  echo "[import] Aborted."
  exit 0
fi

echo "[import] Dropping & recreating schema ${MYSQL_DATABASE}..."
docker exec -i dms-mysql mysql \
  -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  -e "DROP DATABASE IF EXISTS \`${MYSQL_DATABASE}\`; CREATE DATABASE \`${MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "[import] Loading dump into container..."
case "${DUMP_FILE}" in
  *.gz)
    gunzip -c "${DUMP_FILE}" | docker exec -i dms-mysql mysql \
      -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}"
    ;;
  *.sql)
    docker exec -i dms-mysql mysql \
      -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}" < "${DUMP_FILE}"
    ;;
  *)
    echo "[import] ERROR: Unsupported file extension for ${DUMP_FILE} (expected .sql or .sql.gz)"
    exit 2
    ;;
esac

echo "[import] Done. You may now start the backend: docker compose up -d backend frontend"
