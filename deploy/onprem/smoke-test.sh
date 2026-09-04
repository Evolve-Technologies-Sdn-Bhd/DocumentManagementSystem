#!/usr/bin/env bash
# ==========================================================================
# Post-deploy smoke test.
# Run this on the server to verify all 4 components are reachable:
#   - Caddy   :443 TLS handshake
#   - frontend SPA index loads (HTTP 200)
#   - backend /api/system/health   (HTTP 200)
#   - backend /api/ai/config       (validates Caddy → backend routing)
# ==========================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"

FRONT_URL=""
if [ -f ".env" ]; then
    FRONT_URL="$(grep -E '^FRONTEND_URL=' .env | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
fi
FRONT_URL="${FRONT_URL:-https://127.0.0.1}"

PASS=0
FAIL=0

title() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
pass()  { PASS=$((PASS+1)); printf "  ✅ %s\n" "$*"; }
fail()  { FAIL=$((FAIL+1)); printf "  ❌ %s\n" "$*"; }

curl_maybe_k() {
    # Use -k (insecure) because on-prem self-signed CAs won't be trusted yet —
    # that's fine for a functional smoke test of TLS negotiation + routing.
    curl -sS -o /tmp/smoke.body -w "%{http_code}" -k --max-time 15 "$@"
}

title "Containers running"
for svc in mysql backend frontend caddy; do
    status="$(docker compose ps --format json "${svc}" 2>/dev/null | grep -oE '"State":"[^"]+"' | cut -d'"' -f4 || echo MISSING)"
    if [ "${status}" = "running" ]; then pass "${svc}: running"
    else fail "${svc}: ${status}"
    fi
done

title "HTTPS / TLS (Caddy :443)"
code="$(curl_maybe_k "${FRONT_URL}/" || true)"
if [ "${code}" = "200" ]; then pass "SPA index.html = HTTP ${code}"; else fail "SPA index.html = HTTP ${code}"; fi

code2="$(curl_maybe_k "${FRONT_URL}/assets/" || true)"
if [ "${code2}" = "404" ]; then pass "frontend /assets returns 404 (as expected for nonexistent asset)"; else fail "/assets unexpected HTTP ${code2}"; fi

title "Caddy → backend proxy"
health_code="$(curl_maybe_k "${FRONT_URL}/api/system/health" || true)"
case "${health_code}" in
    200|204|401)
        pass "/api/system/health = HTTP ${health_code}";
        ;;
    *)
        fail "/api/system/health = HTTP ${health_code}"
        ;;
esac

ai_conf_code="$(curl_maybe_k "${FRONT_URL}/api/ai/config" || true)"
case "${ai_conf_code}" in
    200|204|401)
        pass "/api/ai/config = HTTP ${ai_conf_code}"
        # If 200 we can also validate body structure
        if [ "${ai_conf_code}" = "200" ]; then
            body="$(cat /tmp/smoke.body 2>/dev/null || true)"
            if echo "${body}" | grep -q '"provider"'; then
                pass "/api/ai/config JSON contains 'provider' field (matches router.get('/config', aiController.getConfig))"
            else
                fail "/api/ai/config 200 but body missing provider. Body preview:"
                echo "${body}" | head -c 300 | sed -e 's/^/    /'
                echo ""
            fi
        fi
        ;;
    *)
        fail "/api/ai/config = HTTP ${ai_conf_code}"
        echo "    Response preview:"
        head -c 300 /tmp/smoke.body 2>/dev/null | sed -e 's/^/    /' ; echo ""
        ;;
esac

rm -f /tmp/smoke.body

echo ""
echo "======================================"
echo " Smoke tests:  PASSED=${PASS}   FAILED=${FAIL}"
echo "======================================"
if [ "${FAIL}" -eq 0 ]; then
    echo "🎉 All smoke tests passed. Your on-prem DMS is live at:"
    echo "     ${FRONT_URL}"
    exit 0
else
    echo "⚠  Some checks failed. Useful diagnostics:"
    echo "     docker compose logs --tail=60 caddy"
    echo "     docker compose logs --tail=60 backend"
    echo "     docker compose ps"
    exit 1
fi
