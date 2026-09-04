FROM node:20-bullseye-slim AS build

WORKDIR /app

ENV NODE_ENV=production \
    npm_config_audit=false \
    npm_config_fund=false \
    NODE_OPTIONS="--max-old-space-size=1536"

COPY package*.json ./

RUN npm ci --no-audit --no-fund --loglevel=error

COPY . .

RUN node --max-old-space-size=1536 ./node_modules/vite/bin/vite.js build --mode production

FROM nginx:1.27-alpine

ENV TZ=Asia/Kuala_Lumpur

# Robust apk add against flaky alpine CDNs: retry 6x with sleep
RUN for i in 1 2 3 4 5 6; do \
      sleep $((i*3)); \
      if apk add --no-cache tzdata; then break; fi; \
      echo "[nginx-build] apk add tzdata failed (attempt $i/6), retrying in $((i*3))s..."; \
      # Failover: switch mirrors when >=2 retries
      if [ $i -ge 2 ] && [ -f /etc/apk/repositories ]; then \
        cp /etc/apk/repositories /etc/apk/repositories.bak.$i 2>/dev/null || true; \
        VER="$(cat /etc/alpine-release 2>/dev/null | cut -d. -f1,2)"; \
        echo "https://mirror.nus.edu.sg/alpine/v${VER}/main"      > /etc/apk/repositories; \
        echo "https://mirror.nus.edu.sg/alpine/v${VER}/community" >> /etc/apk/repositories; \
      fi; \
    done

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
