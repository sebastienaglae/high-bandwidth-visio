# ---- Build static frontend ----
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS build
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
