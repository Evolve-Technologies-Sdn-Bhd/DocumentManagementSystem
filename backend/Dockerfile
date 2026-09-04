FROM node:20-bookworm-slim

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Asia/Kuala_Lumpur \
    CHROME_BIN=/usr/bin/chromium \
    LIBREOFFICE_BIN=/usr/bin/soffice \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
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

COPY package*.json ./

RUN npm ci --omit=dev

COPY prisma ./prisma

RUN npx prisma generate

COPY . .

RUN chmod +x /app/docker-entrypoint.sh \
 && mkdir -p /app/uploads/tmp /app/backups \
 && chown -R node:node /app/uploads /app/backups 2>/dev/null || true

EXPOSE 4000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
