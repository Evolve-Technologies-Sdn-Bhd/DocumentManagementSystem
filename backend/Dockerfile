FROM node:20-bookworm-slim AS runtime-base

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Asia/Kuala_Lumpur \
    CHROME_BIN=/usr/bin/chromium \
    LIBREOFFICE_BIN=/usr/bin/soffice \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    npm_config_audit=false \
    npm_config_fund=false

RUN set -e; \
    apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout="60" -o Acquire::https::Timeout="60" update || \
      { \
        echo "[backend] primary apt sources failed; writing 4x Debian security + mirror fallbacks and retrying"; \
        VER_CODENAME="$(. /etc/os-release 2>/dev/null && echo "${VERSION_CODENAME:-bookworm}")"; \
        { \
          echo "deb http://deb.debian.org/debian ${VER_CODENAME} main"; \
          echo "deb http://deb.debian.org/debian ${VER_CODENAME}-updates main"; \
          echo "deb http://security.debian.org/debian-security ${VER_CODENAME}-security main"; \
          echo "deb http://ftp.cn.debian.org/debian ${VER_CODENAME} main"; \
          echo "deb http://ftp.sg.debian.org/debian ${VER_CODENAME} main"; \
          echo "deb http://mirror.nus.edu.sg/debian ${VER_CODENAME} main"; \
        } > /etc/apt/sources.list; \
        apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout="60" -o Acquire::https::Timeout="60" update; \
      } && \
    apt-get install -y --no-install-recommends -o Acquire::Retries=5 -o APT::Install-Suggests="false" \
        ca-certificates \
        openssl \
        tzdata \
        locales \
        locales-all \
        procps \
        curl \
        unzip \
        fonts-liberation2 \
        fonts-dejavu-core \
        fonts-noto-cjk \
        fonts-noto-color-emoji \
        libreoffice \
        chromium \
        libu2f-udev \
        libvulkan1 \
 && update-locale LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 \
 && echo "Asia/Kuala_Lumpur" > /etc/timezone \
 && ln -sf /usr/share/zoneinfo/Asia/Kuala_Lumpur /etc/localtime \
 && dpkg-reconfigure --frontend noninteractive tzdata 2>/dev/null || true \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /var/cache/apt/* \
 && libreoffice --version \
 && chromium --version

ENV LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    LANGUAGE=en_US:en

FROM runtime-base AS deps

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev --no-audit --no-fund --loglevel=error

COPY prisma ./prisma

RUN npx prisma generate

FROM runtime-base AS final

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .

RUN chmod +x /app/docker-entrypoint.sh \
 && mkdir -p /app/uploads/tmp /app/backups \
 && chown -R node:node /app/uploads /app/backups 2>/dev/null || true

EXPOSE 4000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
