#!/bin/bash
# ==========================================================================
# Stop the stack cleanly.
#   ./deploy/docker/stop.sh           -> stop but keep ALL volumes (data safe)
#   ./deploy/docker/stop.sh data      -> STOP + DELETE MySQL + uploads + backups ONLY
#                           (keeps caddy_data / TLS certs)
#   ./deploy/docker/stop.sh wipe      -> STOP + DESTROY ALL volumes, including
#                           Caddy TLS state / certs. EVERYTHING IS DELETED.
# ==========================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"

MODE="${1:-}"

case "${MODE}" in
  data)
    echo "[stop] DATA-WIPE MODE: keeps Caddy TLS state (caddy_data, caddy_config)."
    echo "  Deletes: dms_mysql_data, dms_uploads, dms_backups."
    read -r -p "Confirm? MySQL + uploaded files + backups will be LOST. [y/N] " ANS
    if [ "${ANS}" != "y" ] && [ "${ANS}" != "Y" ]; then
      echo "[stop] Aborted."
      exit 0
    fi
    docker compose down
    docker volume rm -f \
      documentmanagementsystem_dms_mysql_data \
      documentmanagementsystem_dms_uploads \
      documentmanagementsystem_dms_backups 2>/dev/null || true
    # Also try the short names since compose v2 can name them differently
    docker volume rm -f \
      dms_mysql_data \
      dms_uploads \
      dms_backups 2>/dev/null || true
    echo "[stop] Containers stopped + data volumes removed. Caddy TLS state kept."
    ;;

  wipe)
    echo "[stop] FULL-WIPE MODE — this will STOP containers and DELETE ALL volumes:"
    echo "  - dms_mysql_data  (MySQL database)"
    echo "  - dms_uploads     (uploaded documents/templates/profiles)"
    echo "  - dms_backups     (DMS backup/restore archives)"
    echo "  - caddy_data      (Let's Encrypt / internal CA / TLS state)"
    echo "  - caddy_config    (Caddy autosave config)"
    read -r -p "Are you REALLY sure? Type YES> " ANS
    if [ "${ANS}" != "YES" ]; then
      echo "[stop] Aborted."
      exit 1
    fi
    docker compose down -v
    echo "[stop] Containers stopped + ALL volumes removed."
    ;;

  "")
    docker compose down
    echo "[stop] Containers stopped. All volumes preserved."
    echo "  (run '$0 data' to erase only DB/uploads/backups but keep TLS certs,"
    echo "   run '$0 wipe' to erase EVERYTHING — only for teardown)."
    ;;

  *)
    echo "Usage: $0 [data|wipe]"
    exit 2
    ;;
esac
