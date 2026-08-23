# ---- Build ----
FROM node:22-bookworm-slim

# Toolchain only needed if the mediasoup-worker prebuilt binary is unavailable;
# keeps the image self-sufficient either way.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates python3 python3-pip make g++ perl meson ninja-build pkg-config \
 && rm -rf /var/lib/apt/lists/*

# Runtime network tools for the Net panel (traceroute agent).
RUN apt-get update \
 && apt-get install -y --no-install-recommends traceroute mtr-tiny \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /visio

# Install workspace dependencies (lockfile + all workspace manifests required).
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
RUN npm ci --ignore-scripts || npm install --ignore-scripts

# mediasoup postinstall: fetches the prebuilt linux-x64 worker, compiles if absent.
RUN npm rebuild mediasoup

COPY shared/ shared/
COPY server/ server/

ENV NODE_ENV=production \
    PORT=9090 \
    LISTEN_IP=0.0.0.0

EXPOSE 9090 40000-40100/udp

CMD ["npx", "tsx", "server/src/index.ts"]
