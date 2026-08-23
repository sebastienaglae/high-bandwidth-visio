# ---- Build static frontend ----
FROM node:22-bookworm-slim AS build
WORKDIR /visio

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY web/package.json web/
RUN npm ci

COPY shared/ shared/
COPY web/ web/
RUN npm run build -w web

# ---- Serve with Caddy (static + reverse proxy + auto-TLS) ----
FROM caddy:2-alpine

COPY --from=build /visio/web/dist /srv
COPY web/Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443
