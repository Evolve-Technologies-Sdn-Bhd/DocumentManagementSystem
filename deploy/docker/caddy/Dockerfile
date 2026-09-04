FROM caddy:2.8-alpine

ENV TZ=Asia/Kuala_Lumpur
RUN apk add --no-cache tzdata gettext openssl bash

COPY Caddyfile.tpl /etc/caddy/Caddyfile.tpl
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/data", "/config"]
EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
