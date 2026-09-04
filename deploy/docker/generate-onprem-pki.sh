#!/usr/bin/env bash
# ==========================================================================
# On-Premise Self-Signed PKI Generator (for TLS_MODE=manual)
#
# Creates a Root CA + Server certificate with SANs for your DMS hostnames
# and writes the server cert/key where the Caddy container expects them.
#
# Run this ONCE on the Docker host (or any machine with openssl >= 3.0).
#
# Usage (reads hosts from .env if present):
#   bash ./deploy/docker/generate-onprem-pki.sh
#
# Usage (override hosts):
#   bash ./deploy/docker/generate-onprem-pki.sh \
#       dms.corp.local,intranet.corp.local,10.10.2.50,127.0.0.1,localhost
#
# Outputs:
#   deploy/docker/caddy/tls/
#       server-cert.pem     ← Caddy TLS_CERT_FILE (full chain: leaf + root)
#       server-key.pem      ← Caddy TLS_KEY_FILE  (EC P-384 private key)
#   deploy/docker/caddy/
#       DMS-RootCA.pem      ← Import this into browsers / Linux / macOS keychain
#       DMS-RootCA.crt      ← Same as .pem, for Windows double-click install
#       DMS-RootCA.p7b      ← Windows SChannel / AD GPO deployment
#       DMS-RootCA.srl      ← Serial number tracker (keep, don't distribute)
# ==========================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CADDY_TLS_DIR="${PROJECT_ROOT}/deploy/docker/caddy/tls"
CADDY_PKI_DIR="${PROJECT_ROOT}/deploy/docker/caddy"
mkdir -p "${CADDY_TLS_DIR}" "${CADDY_PKI_DIR}"

ROOT_CA_KEY="${CADDY_PKI_DIR}/DMS-RootCA.key"
ROOT_CA_PEM="${CADDY_PKI_DIR}/DMS-RootCA.pem"
ROOT_CA_CRT="${CADDY_PKI_DIR}/DMS-RootCA.crt"
ROOT_CA_P7B="${CADDY_PKI_DIR}/DMS-RootCA.p7b"
ROOT_CA_SRL="${CADDY_PKI_DIR}/DMS-RootCA.srl"

SERVER_KEY="${CADDY_TLS_DIR}/server-key.pem"
SERVER_CSR="/tmp/dms-server.csr.$$"
SERVER_CRT_PEM="${CADDY_TLS_DIR}/server-cert.pem"
SERVER_EXTFILE="/tmp/dms-v3ext.cnf.$$"

# ---- parse hosts from arg1 OR .env DMS_PUBLIC_URLS -------------------------
HOSTS_ARG="${1:-}"
if [ -z "${HOSTS_ARG}" ] && [ -f "${PROJECT_ROOT}/.env" ]; then
    HOSTS_ARG="$(grep -E '^DMS_PUBLIC_URLS=' "${PROJECT_ROOT}/.env" | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
fi
if [ -z "${HOSTS_ARG}" ]; then
    HOSTS_ARG="localhost,127.0.0.1"
fi

# split HOSTS_ARG into (DNS: ... ) and (IP: ... ) lists
DNS_NAMES=""
IP_ADDRS=""
OIFS="${IFS}"; IFS=','
for raw in ${HOSTS_ARG}; do
    IFS="${OIFS}"
    h="$(echo "${raw}" | tr -d '[:space:]')"
    [ -z "${h}" ] && continue
    # strip scheme if present
    h="${h#http://}"
    h="${h#https://}"
    h="${h%%:*}"   # strip port
    h="${h%%/*}"   # strip path
    # IPv4?
    if [[ "${h}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        [ -n "${IP_ADDRS}" ] && IP_ADDRS="${IP_ADDRS},"
        IP_ADDRS="${IP_ADDRS}${h}"
    else
        [ -n "${DNS_NAMES}" ] && DNS_NAMES="${DNS_NAMES},"
        DNS_NAMES="${DNS_NAMES}${h}"
    fi
done
IFS="${OIFS}"

# Guarantee coverage of localhost / 127.0.0.1 for local admin access
[[ ",${DNS_NAMES}," != *",localhost,"* ]] && DNS_NAMES="${DNS_NAMES},localhost"
[[ ",${IP_ADDRS}," != *",127.0.0.1,"* ]] && IP_ADDRS="${IP_ADDRS},127.0.0.1"

echo "[pki] DNS SANs: ${DNS_NAMES}"
echo "[pki] IP  SANs: ${IP_ADDRS}"

# ---- 1. Root CA (ECDSA P-384, 20 years) -----------------------------------
if [ ! -f "${ROOT_CA_KEY}" ]; then
    echo "[pki] Generating NEW DMS Root CA (EC P-384)..."
    openssl ecparam -name secp384r1 -genkey -noout -out "${ROOT_CA_KEY}"
    chmod 600 "${ROOT_CA_KEY}"
    openssl req -new -x509 -key "${ROOT_CA_KEY}" \
        -sha384 -days 7305 \
        -subj "/C=MY/ST=Kuala Lumpur/L=KL/O=On-Prem DMS/OU=IT/CN=DMS On-Prem Root CA v1" \
        -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
        -addext "keyUsage=critical,keyCertSign,cRLSign,digitalSignature" \
        -addext "subjectKeyIdentifier=hash" \
        -addext "nameConstraints=critical,permitted;DNS:.local,permitted;DNS:.corp,permitted;DNS:.internal,permitted;IP:10.0.0.0/255.0.0.0,permitted;IP:172.16.0.0/255.240.0.0,permitted;IP:192.168.0.0/255.255.0.0,permitted;IP:127.0.0.0/255.0.0.0" \
        -out "${ROOT_CA_PEM}"
else
    echo "[pki] Reusing existing DMS Root CA at ${ROOT_CA_KEY}"
fi
cp "${ROOT_CA_PEM}" "${ROOT_CA_CRT}"
openssl crl2pkcs7 -nocrl -certfile "${ROOT_CA_PEM}" -out "${ROOT_CA_P7B}"

# ---- 2. Server key + CSR ---------------------------------------------------
echo "[pki] Generating server private key (EC P-384)..."
openssl ecparam -name secp384r1 -genkey -noout -out "${SERVER_KEY}"
chmod 600 "${SERVER_KEY}"

cat > "${SERVER_EXTFILE}" <<EOF
[v3_req]
basicConstraints       = CA:FALSE
keyUsage               = critical, digitalSignature, keyEncipherment, keyAgreement
extendedKeyUsage       = serverAuth, clientAuth
subjectKeyIdentifier   = hash
authorityKeyIdentifier = keyid,issuer
subjectAltName         = @alt_names
[alt_names]
EOF

idx=1
OLDIFS="${IFS}"; IFS=','
set -- ${DNS_NAMES}
IFS="${OLDIFS}"
for d in "$@"; do
    [ -z "${d}" ] && continue
    echo "DNS.${idx} = ${d}" >> "${SERVER_EXTFILE}"
    idx=$((idx + 1))
done
idx=1
OLDIFS="${IFS}"; IFS=','
set -- ${IP_ADDRS}
IFS="${OLDIFS}"
for i in "$@"; do
    [ -z "${i}" ] && continue
    echo "IP.${idx} = ${i}" >> "${SERVER_EXTFILE}"
    idx=$((idx + 1))
done

echo "[pki] v3 extensions file:"
cat "${SERVER_EXTFILE}"

echo "[pki] Creating CSR..."
openssl req -new -key "${SERVER_KEY}" \
    -subj "/C=MY/ST=Kuala Lumpur/L=KL/O=On-Prem DMS/CN=${DNS_NAMES%%,*}" \
    -out "${SERVER_CSR}"

# ---- 3. Sign server cert with Root CA (825 days max — macOS/iOS limit) -----
SIGN_OPTS=()
[ -f "${ROOT_CA_SRL}" ] && SIGN_OPTS+=(-CAserial "${ROOT_CA_SRL}") || SIGN_OPTS+=(-CAcreateserial)

echo "[pki] Signing server certificate with Root CA..."
openssl x509 -req -sha384 -days 825 \
    -in "${SERVER_CSR}" \
    -CA "${ROOT_CA_PEM}" \
    -CAkey "${ROOT_CA_KEY}" \
    "${SIGN_OPTS[@]}" \
    -CAserial "${ROOT_CA_SRL}" \
    -extfile "${SERVER_EXTFILE}" \
    -extensions v3_req \
    -out /tmp/dms-server-leaf.pem.$$

mv "${ROOT_CA_SRL}" "${ROOT_CA_SRL}.tmp"
mv "${ROOT_CA_SRL}.tmp" "${ROOT_CA_SRL}"

# Full chain PEM = leaf + root (Caddy will present leaf + chain intermediates to clients)
cat /tmp/dms-server-leaf.pem.$$ "${ROOT_CA_PEM}" > "${SERVER_CRT_PEM}"

rm -f "${SERVER_CSR}" "${SERVER_EXTFILE}" /tmp/dms-server-leaf.pem.$$

# ---- 4. Verify ------------------------------------------------------------
echo ""
echo "[pki] === Certificate verification ==="
openssl verify -CAfile "${ROOT_CA_PEM}" "${SERVER_CRT_PEM}" || {
    echo "[pki] ERROR: server cert chain verification failed" >&2
    exit 1
}
echo ""
echo "[pki] === Server cert SAN list ==="
openssl x509 -in "${SERVER_CRT_PEM}" -noout -ext subjectAltName
echo ""
echo "[pki] === Output files ==="
ls -la "${CADDY_TLS_DIR}/"* "${ROOT_CA_KEY}" "${ROOT_CA_PEM}" "${ROOT_CA_CRT}" "${ROOT_CA_P7B}" 2>/dev/null | sed 's/^/    /'
echo ""

# ---- 5. Print deployment instructions -------------------------------------
cat <<EOF

========================================================================
✅  PKI GENERATION COMPLETE
========================================================================

NEXT STEPS — add these to your project root .env:

    TLS_MODE=manual
    DMS_PUBLIC_URLS=${HOSTS_ARG}
    ACME_EMAIL=
    TLS_CERT_FILE=/etc/caddy/tls/server-cert.pem
    TLS_KEY_FILE=/etc/caddy/tls/server-key.pem
    CORS_ORIGIN=https://${DNS_NAMES%%,*}
    FRONTEND_URL=https://${DNS_NAMES%%,*}

Then rebuild + restart:
    docker compose down
    docker compose up -d --build caddy

========================================================================
🔐  CLIENT / DOMAIN TRUST INSTALLATION
========================================================================
You MUST install the ROOT CA on every machine that will access the DMS.
Distribute ONLY the ROOT CA files — NEVER distribute server-key.pem!

  Windows (per-machine GPO / MMC):
      1. Open mmc.exe → File → Add/Remove Snap-in → Certificates → Computer account → Local computer
      2. Expand: Certificates (Local Computer) → Trusted Root Certification Authorities → Certificates
      3. Right-click → All Tasks → Import... → pick  ${ROOT_CA_P7B}  (or .crt)
      4. OK, done. Reboot or re-launch browsers.

  Windows (single user, double-click):
      Double-click  ${ROOT_CA_CRT}  → Install Certificate → Current User or Local Machine
      → Place into: Trusted Root Certification Authorities → OK.

  Linux (Debian/Ubuntu, system-wide):
      sudo cp ${ROOT_CA_PEM} /usr/local/share/ca-certificates/DMS-OnPrem-RootCA.crt
      sudo update-ca-certificates

  Linux (RHEL/CentOS/Rocky, system-wide):
      sudo cp ${ROOT_CA_PEM} /etc/pki/ca-trust/source/anchors/DMS-OnPrem-RootCA.pem
      sudo update-ca-trust extract

  macOS (System keychain):
      sudo security add-trusted-cert -d -r trustRoot \
          -k /Library/Keychains/System.keychain ${ROOT_CA_PEM}

  Mobile (iOS via MDM): deploy the .p7b as a Certificate payload in Apple Configurator / Intune.
  Mobile (Android): Settings → Security → Install from SD card → pick ${ROOT_CA_PEM}.

========================================================================
EOF
