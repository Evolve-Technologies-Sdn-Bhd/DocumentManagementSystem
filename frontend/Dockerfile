FROM node:20-bullseye-slim AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM nginx:1.27-alpine

ENV TZ=Asia/Kuala_Lumpur
RUN apk add --no-cache tzdata

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
