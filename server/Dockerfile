# ---- Build ----
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS build

# Toolchain only needed if the mediasoup-worker prebuilt binary is unavailable;
# keeps the image self-sufficient either way.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates python3 python3-pip make g++ perl meson ninja-build pkg-config \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /visio

# Install workspace dependencies (lockfile + all workspace manifests required).
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
RUN npm ci --ignore-scripts

# mediasoup postinstall: fetches the prebuilt linux-x64 worker, compiles if absent.
RUN npm rebuild mediasoup

COPY shared/ shared/
COPY server/ server/

RUN npm run build -w server \
 && npm prune --omit=dev

# ---- Minimal production runtime ----
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates traceroute mtr-tiny \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /visio

COPY --from=build /visio/node_modules ./node_modules
COPY --from=build /visio/server/dist ./server/dist

ENV NODE_ENV=production \
    PORT=9090 \
    LISTEN_IP=0.0.0.0

EXPOSE 9090 40000-40100/udp

USER node

CMD ["node", "server/dist/index.js"]
