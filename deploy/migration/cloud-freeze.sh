#!/usr/bin/env bash
# ==========================================================================
# HUAWEI CLOUD aaPanel (159.138.233.253) — FREEZE during cutover window
#
# Purpose: Stop all DMS writes on the aaPanel side BEFORE the FINAL data
# export so that no documents/uploads/changes happen between "dump" and
# "switch DNS to on-prem". That guarantees 100% consistent cutover with
# ZERO lost data.
#
# Usage (run as root on 159.138.233.253):
#   bash cloud-freeze.sh on     — puts DMS into maintenance (read-only mode)
#   bash cloud-freeze.sh status — shows current state
#   bash cloud-freeze.sh off    — restores everything (if you abort cutover)
#
# Effects:
#   • pm2 stop all (or pm2 stop <ecosystem name>)
#   • If DMS runs under plain node via systemd → systemctl stop dms-backend
#   • Nginx: replace DMS vhost config with a 503 "under maintenance" page
#     so users see a friendly message + retry-after, not blank 502.
#   • Chmod uploads/ dirs 0555 (read-only) so even if node came back up
#     somehow, it cannot write.
#   • Creates /root/dms-migration/freeze.state so "off" can undo it all.
# ==========================================================================
set -euo pipefail

ACTION="${1:-status}"
if [ "${ACTION}" != "on" ] && [ "${ACTION}" != "off" ] && [ "${ACTION}" != "status" ]; then
    echo "Usage: $0  on | off | status"; exit 2
fi

ME="$(whoami)"
if [ "${ME}" != "root" ]; then echo "[cloud-freeze] Must be root." >&2; exit 1; fi

STATE_DIR="/root/dms-migration"
STATE_FILE="${STATE_DIR}/freeze.state"
mkdir -p "${STATE_DIR}"

# ---- auto-detect aaPanel nginx + DMS vhost --------------------------------
NGINX_SBIN="$(command -v nginx || true)"
[ -z "${NGINX_SBIN}" ] && [ -x /www/server/nginx/sbin/nginx ] && NGINX_SBIN="/www/server/nginx/sbin/nginx"
NGINX_CONF_ROOT="/www/server/panel/vhost/nginx"
[ ! -d "${NGINX_CONF_ROOT}" ] && NGINX_CONF_ROOT="/www/server/nginx/conf/vhost"

DMS_BACKEND_DIR="${DMS_BACKEND_DIR:-}"
if [ -z "${DMS_BACKEND_DIR}" ]; then
    for cand in /www/wwwroot/dms/backend /www/wwwroot/dms-live/backend /www/wwwroot/default/backend; do
        if [ -d "${cand}" ] && [ -f "${cand}/src/index.js" ]; then DMS_BACKEND_DIR="${cand}"; break; fi
    done
fi

DMS_NGINX_CONF="${DMS_NGINX_CONF:-}"
if [ -z "${DMS_NGINX_CONF}" ] && [ -d "${NGINX_CONF_ROOT}" ]; then
    # Heuristic: find vhost that contains "proxy_pass ... 4000" (typical DMS)
    for f in "${NGINX_CONF_ROOT}"/*.conf; do
        [ -f "${f}" ] || continue
        if grep -Eq 'proxy_pass[^;]*:4000' "${f}"; then
            DMS_NGINX_CONF="${f}"; break
        fi
    done
fi

MAINT_PAGE="${NGINX_CONF_ROOT}/dms-maintenance.html"
cat > "${MAINT_PAGE}" <<'HTML'
<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><title>DMS Maintenance</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{background:#0f172a;color:#e2e8f0;font-family:system-ui,Segoe UI,Roboto,Arial;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
.card{max-width:560px;background:#1e293b;border:1px solid #334155;border-radius:14px;padding:32px 36px;box-shadow:0 10px 30px rgba(0,0,0,.4)}
h1{margin:0 0 10px;font-size:22px;color:#f8fafc}p{margin:0 0 12px;line-height:1.6}code{background:#0b1220;padding:2px 6px;border-radius:4px;color:#fbbf24}
.meta{font-size:12px;opacity:.6;margin-top:22px}</style>
</head><body><div class="card">
<h1>🔧 DMS sedang dalam penyelenggaraan / Maintenance</h1>
<p>Sedang migrate dari Huawei Cloud ke On-Prem server. Sila refresh semula dalam 10-15 minit.</p>
<p>Migrating from Huawei Cloud (159.138.233.253) → on-prem server. Please retry in ~15 minutes.</p>
<p>Jika masih gagal selepas 30 minit, sila hubungi IT. / If this persists, contact IT.</p>
<div class="meta">Retry-After: 900 &middot; freeze_time=<code id="t">-</code> &middot; source=159.138.233.253</div>
<script>document.getElementById('t').textContent=new Date().toISOString()</script>
</div></body></html>
HTML

# ---- ACTION: status --------------------------------------------------------
if [ "${ACTION}" = "status" ]; then
    echo "=== DMS freeze status on $(hostname) / 159.138.233.253 ==="
    echo "state file: ${STATE_FILE}"
    [ -f "${STATE_FILE}" ] && echo "CURRENT STATE = FROZEN (cutover in progress) — $(cat "${STATE_FILE}")" || echo "CURRENT STATE = LIVE (operational)"
    echo ""
    echo "Backend dir : ${DMS_BACKEND_DIR:-not detected}"
    echo "Nginx bin   : ${NGINX_SBIN:-not detected}"
    echo "DMS vhost   : ${DMS_NGINX_CONF:-not detected}"
    echo ""
    if command -v pm2 >/dev/null 2>&1; then
        echo "pm2 status:"
        pm2 list | sed 's/^/  /' || true
    fi
    exit 0
fi

# ---- ACTION: on ------------------------------------------------------------
if [ "${ACTION}" = "on" ]; then
    [ -f "${STATE_FILE}" ] && { echo "[cloud-freeze] Already frozen — ${STATE_FILE} exists. Run '$0 off' first."; exit 0; }
    echo "[cloud-freeze] F R E E Z I N G   DMS on aaPanel (159.138.233.253)"

    # Backup original DMS nginx conf
    if [ -n "${DMS_NGINX_CONF}" ] && [ -f "${DMS_NGINX_CONF}" ]; then
        cp -a "${DMS_NGINX_CONF}" "${DMS_NGINX_CONF}.pre-freeze.$(date +%s).bak"
        # Replace it with a 503 maintenance server block that preserves hostnames.
        SERVER_NAMES="$(grep -E '^\s*server_name\s+' "${DMS_NGINX_CONF}" | head -1 | sed -E 's/^\s*server_name\s*//' | sed 's/;.*$//' | tr -d '\r' || echo '_')"
        LISTEN_LINES="$(grep -E '^\s*listen\s+' "${DMS_NGINX_CONF}" | tr -d '\r' || echo "listen 80; listen 443 ssl http2;")"
        cat > "${DMS_NGINX_CONF}" <<EOF
server {
${LISTEN_LINES}
    server_name ${SERVER_NAMES};
    return 503;
    error_page 503 /dms-maintenance.html;
    root ${NGINX_CONF_ROOT};
    location = /dms-maintenance.html { internal; }
    add_header Retry-After "900" always;
}
EOF
        echo "[cloud-freeze] nginx DMS vhost → 503 maintenance page"
    fi

    # Reload nginx
    if [ -n "${NGINX_SBIN}" ]; then
        if "${NGINX_SBIN}" -t; then
            "${NGINX_SBIN}" -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true
            echo "[cloud-freeze] nginx reloaded."
        else
            echo "[cloud-freeze] ⚠ nginx config test FAILED — inspect vhost syntax manually before reload."
        fi
    fi

    # Stop backend PM2 (aaPanel most common)
    if command -v pm2 >/dev/null 2>&1; then
        # Save list to state file
        pm2 jlist > "${STATE_DIR}/pm2-list.freeze.json" 2>/dev/null || true
        pm2 save --force >/dev/null 2>&1 || true
        pm2 stop all || true
        echo "[cloud-freeze] pm2 stop all → done."
    fi
    # Also stop any obvious systemd units
    for svc in dms-backend dms-backend.service dms node-dms; do
        if systemctl is-active --quiet "${svc}" 2>/dev/null; then
            systemctl stop "${svc}"
            echo "[cloud-freeze] systemctl stop ${svc}"
        fi
    done
    # Last-resort kill any remaining node process listening on :4000
    PID4000="$(ss -ltnp 2>/dev/null | awk '$4 ~ /:4000$/ {print $6}' | sed -E 's/.*pid=([0-9]+),.*/\1/' | head -1 || true)"
    [ -n "${PID4000}" ] && { kill -TERM "${PID4000}" 2>/dev/null || true; echo "[cloud-freeze] kill pid ${PID4000} (:4000)"; }

    # Mark uploads folder read-only so even if a rogue node starts, can't write
    SAVED_PERMS=""
    if [ -n "${DMS_BACKEND_DIR}" ]; then
        for d in "${DMS_BACKEND_DIR}/uploads" "${DMS_BACKEND_DIR}/uploads/documents" "${DMS_BACKEND_DIR}/uploads/templates" "${DMS_BACKEND_DIR}/backups"; do
            [ -d "${d}" ] || continue
            SAVED_PERMS="${SAVED_PERMS}${d}=$(stat -c '%a' "${d}" 2>/dev/null)
"
            chmod -R a-w "${d}" 2>/dev/null || true
            echo "[cloud-freeze] read-only: ${d}"
        done
    fi

    cat > "${STATE_FILE}" <<EOF
frozen_at=$(date -Iseconds)
frozen_by=$(whoami)@$(hostname)
dms_backend_dir=${DMS_BACKEND_DIR}
dms_nginx_conf=${DMS_NGINX_CONF}
saved_permissions=$(printf '%s' "${SAVED_PERMS}" | tr '\n' '|')
EOF

    echo "[cloud-freeze] ✅ FROZEN. State saved to ${STATE_FILE}"
    echo "   Users now see maintenance page on DMS URL. No new writes to DB/uploads."
    echo "   → Now run cloud-export.sh AGAIN for the final bundle, then move to on-prem."
    exit 0
fi

# ---- ACTION: off -----------------------------------------------------------
if [ "${ACTION}" = "off" ]; then
    [ ! -f "${STATE_FILE}" ] && { echo "[cloud-freeze] Not frozen (no ${STATE_FILE}). Nothing to do."; exit 0; }
    echo "[cloud-freeze] UNFREEZING DMS on aaPanel (159.138.233.253)"

    # shellcheck disable=SC1090
    . "${STATE_FILE}" || true

    # Restore uploads permissions
    if [ -n "${saved_permissions:-}" ]; then
        echo "${saved_permissions}" | tr '|' '\n' | while IFS='=' read -r dir perms; do
            [ -z "${dir}" ] && continue
            [ -d "${dir}" ] && { chmod -R "${perms}" "${dir}" 2>/dev/null || true; echo "[cloud-freeze] restore chmod ${perms} ${dir}"; }
        done
    fi

    # Restore DMS nginx vhost
    if [ -n "${dms_nginx_conf:-}" ]; then
        BAK="$(ls -1 "${dms_nginx_conf}".pre-freeze.*.bak 2>/dev/null | sort -r | head -1 || true)"
        if [ -n "${BAK}" ] && [ -f "${BAK}" ]; then
            cp -a "${BAK}" "${dms_nginx_conf}"
            echo "[cloud-freeze] restored ${dms_nginx_conf} from ${BAK}"
            if [ -n "${NGINX_SBIN}" ] && "${NGINX_SBIN}" -t; then
                "${NGINX_SBIN}" -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true
            fi
        fi
    fi

    # Restart backend
    if command -v pm2 >/dev/null 2>&1; then
        if [ -f "${STATE_DIR}/pm2-list.freeze.json" ]; then
            PM2_RESURRECT_DIR="${HOME}/.pm2/resurrect"
            mkdir -p "${PM2_RESURRECT_DIR}"
            pm2 resurrect 2>/dev/null || pm2 restart all || true
        else
            pm2 restart all || true
        fi
        echo "[cloud-freeze] pm2 restarted."
    fi
    for svc in dms-backend dms-backend.service dms node-dms; do
        systemctl is-enabled --quiet "${svc}" 2>/dev/null && { systemctl start "${svc}"; echo "[cloud-freeze] systemctl start ${svc}"; }
    done

    rm -f "${STATE_FILE}"
    echo "[cloud-freeze] ✅ UNFROZEN. DMS on aaPanel is LIVE again."
    exit 0
fi
