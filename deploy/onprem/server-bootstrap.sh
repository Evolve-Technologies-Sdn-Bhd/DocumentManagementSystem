#!/usr/bin/env bash
# ==========================================================================
# ON-PREM LINUX SERVER — ONE-TIME BOOTSTRAP
# Run this ONCE on the TARGET on-prem Linux server (the machine that will
# host DMS via Docker). You can pipe it over SSH, or run it from the console.
#
#   # From your Windows workstation (172.19.0.86):
#   ssh <USER>@<SERVER-IP> 'bash -s' < deploy/onprem/server-bootstrap.sh
#
# What it does (idempotent — safe to re-run):
#   1. Installs latest Docker Engine + Docker Compose v2 (from official repo).
#   2. Creates non-root user 'dmsadmin' (if missing), adds to 'docker' group.
#   3. Enables + starts docker.socket, docker.service on boot.
#   4. Installs ufw (if absent), then ALLOWS 22/tcp (SSH) + 80/tcp + 443/tcp + 443/udp (HTTP3).
#      NOTE: If you already use corporate firewalls / Palo Alto this is a no-op
#            — packets will be filtered by the upstream HW firewall anyway.
#   5. Hardens SSH: disables password auth *IF* caller sets HARDEN_SSH=1
#      (it is off by default so you don't lock yourself out).
#   6. Installs useful tools: htop, iotop, jq, curl, vim, rsync, lsof,
#      ca-certificates, gnupg, openssl, mtr, unzip.
#   7. Prints a summary + SSH key copy instructions for your 172.19.0.86 workstation.
# ==========================================================================
set -euo pipefail

DISTRO_ID=""
DISTRO_VER=""

detect_distro() {
    if command -v lsb_release >/dev/null 2>&1; then
        DISTRO_ID="$(lsb_release -si | tr '[:upper:]' '[:lower:]')"
        DISTRO_VER="$(lsb_release -sr)"
    elif [ -f /etc/os-release ]; then
        # shellcheck disable=SC1091
        . /etc/os-release
        DISTRO_ID="${ID}"
        DISTRO_VER="${VERSION_ID:-}"
    else
        echo "[bootstrap] ❌ Cannot detect distro (/etc/os-release missing and no lsb_release)." >&2
        exit 2
    fi
    echo "[bootstrap] Detected distro: ${DISTRO_ID} ${DISTRO_VER}"
}

need_root() {
    if [ "$(id -u)" -ne 0 ]; then
        echo "[bootstrap] ❌ Please run as root (sudo bash $0)." >&2
        exit 1
    fi
}

# -------- Debian / Ubuntu family -----------------------------------------
install_docker_apt() {
    local keyring_dir="/etc/apt/keyrings"
    mkdir -p "${keyring_dir}"
    chmod 0755 "${keyring_dir}"

    local keyring="${keyring_dir}/docker.gpg"
    if [ ! -f "${keyring}" ]; then
        curl -fsSL "https://download.docker.com/linux/${DISTRO_ID}/gpg" \
            | gpg --dearmor --batch --yes -o "${keyring}"
        chmod a+r "${keyring}"
    fi

    local arch
    arch="$(dpkg --print-architecture)"
    local codename
    codename="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
    local src_list="/etc/apt/sources.list.d/docker.list"
    echo "deb [arch=${arch} signed-by=${keyring}] https://download.docker.com/linux/${DISTRO_ID} ${codename} stable" \
        > "${src_list}"
    chmod 0644 "${src_list}"

    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y -qq
    apt-get install -y -qq \
        docker-ce docker-ce-cli containerd.io \
        docker-buildx-plugin docker-compose-plugin
}

# -------- RHEL / Rocky / Alma / CentOS family -----------------------------
install_docker_yum() {
    local dnf_cmd=""
    if command -v dnf >/dev/null 2>&1; then dnf_cmd="dnf"; else dnf_cmd="yum"; fi

    ${dnf_cmd} install -y -q dnf-plugins-core || true
    if ! grep -rq 'download.docker.com' /etc/yum.repos.d/ 2>/dev/null; then
        ${dnf_cmd} config-manager --add-repo "https://download.docker.com/linux/centos/docker-ce.repo" || \
        ${dnf_cmd} config-manager --add-repo "https://download.docker.com/linux/rhel/docker-ce.repo"
    fi

    ${dnf_cmd} install -y -q \
        docker-ce docker-ce-cli containerd.io \
        docker-buildx-plugin docker-compose-plugin
}

# -------- Common post-install steps --------------------------------------
common_post_install() {
    systemctl unmask docker.service || true
    systemctl unmask docker.socket  || true
    systemctl enable --now docker.service
    systemctl enable --now containerd.service || true

    # Dedicated non-root deployer account
    if ! id -u dmsadmin >/dev/null 2>&1; then
        echo "[bootstrap] Creating user dmsadmin (deployer account)..."
        useradd -m -s /bin/bash dmsadmin || adduser --disabled-password --gecos "" dmsadmin || true
        mkdir -p /home/dmsadmin/.ssh
        chmod 700 /home/dmsadmin/.ssh
        touch /home/dmsadmin/.ssh/authorized_keys
        chmod 600 /home/dmsadmin/.ssh/authorized_keys
        chown -R dmsadmin:dmsadmin /home/dmsadmin/.ssh
    fi
    usermod -aG docker dmsadmin || true
    # (Your own sudo user) — also add current sudo user (other than root) to docker
    if [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != "root" ]; then
        usermod -aG docker "${SUDO_USER}" || true
    fi

    # Verify docker + compose installed
    echo "[bootstrap] Docker version:  $(docker --version 2>/dev/null || echo MISSING)"
    echo "[bootstrap] Compose version: $(docker compose version 2>/dev/null || echo MISSING)"

    # Tools
    if command -v apt-get >/dev/null 2>&1; then
        export DEBIAN_FRONTEND=noninteractive
        apt-get install -y -qq ufw htop iotop jq curl vim nano rsync lsof ca-certificates gnupg openssl mtr-tiny unzip net-tools btop 2>/dev/null || true
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y -q ufw htop iotop jq curl vim nano rsync lsof ca-certificates gnupg openssl mtr unzip net-tools btop 2>/dev/null || true
    elif command -v yum >/dev/null 2>&1; then
        yum install -y -q ufw htop iotop jq curl vim rsync lsof ca-certificates gnupg openssl unzip net-tools 2>/dev/null || true
    fi

    # ufw firewall — open required ports (idempotent)
    if command -v ufw >/dev/null 2>&1; then
        ufw allow 22/tcp   comment 'SSH'     || true
        ufw allow 80/tcp   comment 'HTTP'    || true
        ufw allow 443/tcp  comment 'HTTPS'   || true
        ufw allow 443/udp  comment 'HTTP3/QUIC' || true
        ufw --force enable || true
        echo "[bootstrap] ufw status:"
        ufw status numbered | sed -e 's/^/    /'
    else
        echo "[bootstrap] ufw not installed; assume corporate HW firewall controls 80/443/22 access."
    fi

    # Optional SSH hardening — ONLY if HARDEN_SSH=1 in env and the caller explicitly
    # wants password auth disabled (we require at least 1 key in authorized_keys).
    if [ "${HARDEN_SSH:-0}" = "1" ]; then
        local auth_k="/home/dmsadmin/.ssh/authorized_keys"
        local root_k="/root/.ssh/authorized_keys"
        if [ -s "${auth_k}" ] || [ -s "${root_k}" ]; then
            sshd_conf="/etc/ssh/sshd_config"
            cp "${sshd_conf}" "${sshd_conf}.bak.$(date +%F)" 2>/dev/null || true
            sed -i -E 's/^#?\s*PasswordAuthentication\s+.*/PasswordAuthentication no/' "${sshd_conf}"
            sed -i -E 's/^#?\s*ChallengeResponseAuthentication\s+.*/ChallengeResponseAuthentication no/' "${sshd_conf}"
            sed -i -E 's/^#?\s*PermitRootLogin\s+.*/PermitRootLogin prohibit-password/' "${sshd_conf}"
            systemctl reload sshd || systemctl reload ssh || true
            echo "[bootstrap] SSH hardened: PasswordAuthentication=no, PermitRootLogin=prohibit-password."
        else
            echo "[bootstrap] ⚠ HARDEN_SSH=1 but no authorized_keys found — skipping SSH hardening." >&2
        fi
    fi

    echo ""
    echo "===================================================================="
    echo " ✅  On-prem server bootstrap complete"
    echo "===================================================================="
    echo "  Workstation IP (you)    : 172.19.0.86"
    echo "  Server deployer account : dmsadmin   (in 'docker' group, no sudo yet)"
    echo ""
    echo "  ⭐ From your Windows workstation (172.19.0.86) copy your SSH public key:"
    echo "     (if you don't have one — run: ssh-keygen -t ed25519 -C your@email.com)"
    echo ""
    echo "     type C:\\Users\\YOURNAME\\.ssh\\id_ed25519.pub | ssh root@<SERVER-IP> \"cat >> /home/dmsadmin/.ssh/authorized_keys\""
    echo "     # Linux/WSL equivalent:"
    echo "     ssh-copy-id dmsadmin@<SERVER-IP>"
    echo ""
    echo "  Next step: transfer project code to the server. Options:"
    echo "     (A) Git:  ssh dmsadmin@<SERVER-IP>  'git clone <your-repo>  ~/DocumentManagementSystem'"
    echo "     (B) SCP:  bash deploy/onprem/push-from-workstation.sh  <SERVER-IP> [dmsadmin]"
    echo "===================================================================="
}

# -------- main -----------------------------------------------------------
need_root
detect_distro

case "${DISTRO_ID}" in
    ubuntu|debian|linuxmint|pop|elementary|zorin|kali|parrot)
        install_docker_apt
        ;;
    rhel|centos|almalinux|rocky|ol|amzn|fedora)
        install_docker_yum
        ;;
    *)
        echo "[bootstrap] ⚠ Distro '${DISTRO_ID}' not auto-handled." >&2
        echo "[bootstrap] Install Docker Engine manually first, then re-run me (only post-install steps will apply)." >&2
        common_post_install
        exit 0
        ;;
esac

common_post_install
