#!/bin/bash
# ==========================================================================
# Export MySQL dump from the EXISTING aaPanel server
# Run this ON the aaPanel server (or any host that can reach the old MySQL).
# Adjust credentials to match your aaPanel setup.
# ==========================================================================

OLD_HOST="127.0.0.1"
OLD_PORT="3306"
OLD_USER="dms_user"
OLD_PASS="CHANGE_ME"
OLD_DB="dms_prod"
OUTPUT_FILE="dms-mysql-dump-$(date +%Y%m%d_%H%M%S).sql.gz"

echo "[export] Dumping ${OLD_DB} from ${OLD_HOST}:${OLD_PORT} -> ${OUTPUT_FILE}"

mysqldump \
  --host="${OLD_HOST}" \
  --port="${OLD_PORT}" \
  --user="${OLD_USER}" \
  --password="${OLD_PASS}" \
  --single-transaction \
  --routines \
  --triggers \
  --quick \
  --default-character-set=utf8mb4 \
  "${OLD_DB}" | gzip > "${OUTPUT_FILE}"

echo "[export] Done. File: ${OUTPUT_FILE} ($(du -h "${OUTPUT_FILE}" | cut -f1))"
echo "[export] Copy this file to your on-prem Docker host, then run import-dump.sh"
