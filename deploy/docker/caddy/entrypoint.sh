#!/bin/bash
set -euo pipefail

CADDYFILE="/etc/caddy/Caddyfile"
TPL="/etc/caddy/Caddyfile.tpl"

TLS_MODE="${TLS_MODE:-auto}"
ACME_EMAIL="${ACME_EMAIL:-}"
DMS_PUBLIC_URLS="${DMS_PUBLIC_URLS:-dms.example.com}"
TLS_CERT_FILE="${TLS_CERT_FILE:-}"
TLS_KEY_FILE="${TLS_KEY_FILE:-}"

# ---------------------------------------------------------------------------
# 1. Normalize DMS_PUBLIC_URLS -> comma -> newline -> strip schemes & paths
# ---------------------------------------------------------------------------
normalize_hosts() {
    echo "$1" \
        | tr ',' '\n' \
        | sed -E 's#^https?://##' \
        | sed -E 's#[:/].*$##' \
        | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' \
        | grep -v '^$' \
        | sort -u \
        | paste -sd ',' -
}

HOSTS_CSV="$(normalize_hosts "${DMS_PUBLIC_URLS}")"
if [ -z "${HOSTS_CSV}" ]; then
    echo "[caddy-entrypoint] WARNING: DMS_PUBLIC_URLS yielded zero hosts; falling back to 'localhost'"
    HOSTS_CSV="localhost"
fi

echo "[caddy-entrypoint] TLS_MODE=${TLS_MODE}"
echo "[caddy-entrypoint] Hosts: ${HOSTS_CSV}"

# ---------------------------------------------------------------------------
# 2. Pick template sections based on TLS_MODE
# ---------------------------------------------------------------------------
HOSTS_SB="$(echo "${HOSTS_CSV}" | tr ',' ' ')"

GLOBAL_BLOCK=""
TLS_DIRECTIVE=""

case "${TLS_MODE}" in
# -- auto: Let's Encrypt / ZeroSSL ACME ---------------------------------
auto)
    if [ -n "${ACME_EMAIL}" ]; then
        GLOBAL_BLOCK=$'{
    email '"${ACME_EMAIL}"$'
}
'
    fi
    # site block uses no explicit "tls" — Caddy does ACME auto
    TLS_DIRECTIVE=""
    ;;

# -- internal: Caddy self-signed internal CA ----------------------------
internal)
    TLS_DIRECTIVE=$'    tls internal'
    ;;

# -- manual: user-provided cert & key -----------------------------------
manual)
    if [ -z "${TLS_CERT_FILE}" ] || [ -z "${TLS_KEY_FILE}" ]; then
        echo "[caddy-entrypoint] ERROR: TLS_MODE=manual requires TLS_CERT_FILE and TLS_KEY_FILE to be set" >&2
        exit 2
    fi
    if [ ! -f "${TLS_CERT_FILE}" ]; then
        echo "[caddy-entrypoint] ERROR: TLS_CERT_FILE not found: ${TLS_CERT_FILE}" >&2
        exit 2
    fi
    if [ ! -f "${TLS_KEY_FILE}" ]; then
        echo "[caddy-entrypoint] ERROR: TLS_KEY_FILE not found: ${TLS_KEY_FILE}" >&2
        exit 2
    fi
    TLS_DIRECTIVE=$'    tls '"${TLS_CERT_FILE} ${TLS_KEY_FILE}"
    ;;

*)
    echo "[caddy-entrypoint] ERROR: Unknown TLS_MODE='${TLS_MODE}'. Valid: auto | internal | manual" >&2
    exit 2
    ;;
esac

# ---------------------------------------------------------------------------
# 3. Render final Caddyfile
# ---------------------------------------------------------------------------
{
    if [ -n "${GLOBAL_BLOCK}" ]; then
        echo "${GLOBAL_BLOCK}"
    fi

    echo "${HOSTS_SB} {"
    if [ -n "${TLS_DIRECTIVE}" ]; then
        echo "${TLS_DIRECTIVE}"
    fi

    # Harden + big uploads (matches old nginx dms.conf)
    cat <<'CADDY'
    encode gzip zstd

    @api path /api/*
    reverse_proxy @api backend:4000 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
        transport http {
            versions 1.1
            read_timeout 60s
        }
    }

    @uploads path /uploads/*
    reverse_proxy @uploads backend:4000 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
        transport http {
            versions 1.1
            read_timeout 120s
            write_timeout 120s
        }
    }

    header /index.html Cache-Control "no-cache"
    header /assets/* Cache-Control "public, max-age=31536000, immutable"

    reverse_proxy frontend:80
CADDY
    echo "}"
    echo ""
    echo "# HTTP -> HTTPS redirect (for plaintext requests on port 80)"
    echo ":80 {"
    echo "    redir https://{host}{uri} permanent"
    echo "}"
} > "${CADDYFILE}"

echo "[caddy-entrypoint] Rendered Caddyfile ${CADDYFILE}:"
sed -e 's/^/    | /' "${CADDYFILE}"

exec "$@"
