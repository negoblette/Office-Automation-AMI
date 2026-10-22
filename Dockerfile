# Image produksi Office Automation (Tahap 10.5). Satu Dockerfile, tiga target:
#   app     — Next.js (output standalone)           → docker-compose.prod.yml service "app"
#   worker  — pg-boss worker (bundle esbuild)        → service "worker"
#   migrate — prisma migrate deploy / db seed        → service "migrate" (sekali jalan)
# Build: docker compose -f docker-compose.prod.yml build

# Versi dikunci sampai patch (hardening Tahap 4); naikkan dengan sengaja, lalu uji ulang.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim
# prisma.config.ts mewajibkan DATABASE_URL walau hanya untuk `prisma generate`; nilai palsu ini
# hanya dipakai saat build (inline di RUN), tidak tersimpan di image. Runtime memakai env compose.
ARG BUILD_DATABASE_URL=postgresql://build:build@localhost:5432/build

# ---------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
ARG BUILD_DATABASE_URL
# openssl dibutuhkan schema engine Prisma (migrate deploy).
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# postinstall menjalankan `prisma generate` (butuh schema di atas).
RUN DATABASE_URL="$BUILD_DATABASE_URL" npm ci

# ---------------------------------------------------------------------
FROM deps AS build
ARG BUILD_DATABASE_URL
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN export DATABASE_URL="$BUILD_DATABASE_URL" \
 && npx prisma generate \
 && npm run build \
 && npm run build:worker

# ---------------------------------------------------------------------
# Dependency produksi untuk worker (tanpa devDependencies & tanpa postinstall prisma).
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# ---------------------------------------------------------------------
FROM ${NODE_IMAGE} AS app
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Jakarta \
    UPLOAD_DIR=/app/storage/uploads \
    RECOVERY_DIR=/app/storage/recovery
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Folder upload & kunci pemulihan milik node: volume baru mewarisi kepemilikan ini.
RUN mkdir -p /app/storage/uploads /app/storage/recovery && chown -R node:node /app/storage
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# ---------------------------------------------------------------------
FROM ${NODE_IMAGE} AS worker
WORKDIR /app
ENV NODE_ENV=production TZ=Asia/Jakarta UPLOAD_DIR=/app/storage/uploads
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist/worker.mjs ./worker.mjs
COPY package.json ./
# Folder upload milik node (hardening Tahap 4): volume "uploads" yang baru dibuat mewarisi kepemilikan ini, siapa pun
# container yang lebih dulu memasangnya.
RUN mkdir -p /app/storage/uploads && chown -R node:node /app/storage
USER node
CMD ["node", "worker.mjs"]

# ---------------------------------------------------------------------
# Migrasi, seed, & alat data (data:encrypt / data:lihat / data:cari-nik / recovery:refresh) memakai toolchain lengkap
# (prisma CLI, tsx).
FROM deps AS migrate
WORKDIR /app
COPY src ./src
# tsconfig.json: alias "@/" untuk skrip CLI di scripts/ (hardening Tahap 4).
COPY tsconfig.json ./
COPY scripts ./scripts
ENV TZ=Asia/Jakarta \
    UPLOAD_DIR=/app/storage/uploads \
    RECOVERY_DIR=/app/storage/recovery \
    CHECKPOINT_DISABLE=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
RUN mkdir -p /app/storage/uploads /app/storage/recovery && chown -R node:node /app/storage
USER node
CMD ["npx", "prisma", "migrate", "deploy"]
