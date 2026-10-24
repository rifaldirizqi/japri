FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
# --omit=peer: buang sharp (cuma buat thumbnail media, di-load opsional sama Baileys)
RUN npm ci --omit=dev --omit=peer
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production \
    DATA_DIR=/data \
    RUNNING_IN_DOCKER=1
VOLUME /data

ENTRYPOINT ["npx", "tsx", "src/main.ts"]
