# ---- Build static frontend ----
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS build
WORKDIR /visio

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY web/package.json web/
RUN npm ci

COPY shared/ shared/
COPY web/ web/
RUN npm run build -w web

# ---- Serve with Caddy (static + reverse proxy + auto-TLS) ----
FROM caddy:2-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648

COPY --from=build /visio/web/dist /srv
COPY web/Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443
