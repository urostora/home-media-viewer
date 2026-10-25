# Base images are supplied by Compose from docker/base-images.yml.
ARG NODE_IMAGE
ARG NODE_SLIM_IMAGE
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /home/node/app
ENV PUPPETEER_SKIP_DOWNLOAD=true
# Install from the lockfile before copying source to preserve this cache layer.
COPY ./home-media-viewer/package.json ./home-media-viewer/package-lock.json ./
RUN --mount=type=cache,id=hmv-npm,target=/root/.npm,sharing=locked npm ci --no-audit --no-fund
COPY ./home-media-viewer/prisma/schema.prisma ./prisma/schema.prisma
RUN ./node_modules/.bin/prisma generate

FROM dependencies AS builder
ARG TARGETARCH
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY ./home-media-viewer/src ./src
COPY ./home-media-viewer/public ./public
COPY ./home-media-viewer/__tests__ ./__tests__
COPY ./home-media-viewer/eslint.config.mjs ./eslint.config.mjs
COPY ./home-media-viewer/tsconfig.json ./home-media-viewer/jsconfig.json ./
COPY ./home-media-viewer/next.config.js.prod ./next.config.js
RUN --mount=type=cache,id=hmv-next26-${TARGETARCH},target=/home/node/app/.next/cache,sharing=locked export APP_SESSION_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')" && npm run lint && npm run build

FROM ${NODE_SLIM_IMAGE} AS runtime-base
ARG DEBIAN_MIRROR=https://deb.debian.org
# Slim omits CA certificates; bootstrap HTTPS with Node's bundled Mozilla roots.
RUN mkdir -p /etc/ssl/certs \
    && node -e 'require("node:fs").writeFileSync("/etc/ssl/certs/ca-certificates.crt", require("node:tls").rootCertificates.join("\n") + "\n")' \
    && sed -i "s|http://deb.debian.org/debian$|${DEBIAN_MIRROR}/debian|; s|http://deb.debian.org/debian-security$|https://deb.debian.org/debian-security|" /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::https::CaInfo=/etc/ssl/certs/ca-certificates.crt -o Acquire::Retries=3 -o Acquire::https::Timeout=30 update --error-on=any && apt-get -o Acquire::https::CaInfo=/etc/ssl/certs/ca-certificates.crt -o Acquire::Retries=3 -o Acquire::https::Timeout=30 install -y --no-install-recommends ca-certificates openssl ffmpeg && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
WORKDIR /home/node/app
FROM runtime-base AS app
COPY --from=builder --chown=node:node /home/node/app/.next/standalone ./
COPY --from=builder --chown=node:node /home/node/app/.next/static ./.next/static
COPY --from=dependencies --chown=node:node /home/node/app/node_modules/.prisma ./node_modules/.prisma
COPY --from=dependencies --chown=node:node /home/node/app/node_modules/bcrypt ./node_modules/bcrypt
COPY --chown=node:node ./home-media-viewer/public ./public
COPY --chown=node:node ./home-media-viewer/runBackgroundScheduler.mjs ./home-media-viewer/validateProductionConfig.mjs ./home-media-viewer/startServer.cjs ./
RUN mkdir -p /mnt/storage && chown node:node /mnt/storage
USER node
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["sh", "-ec", "node validateProductionConfig.mjs && exec node startServer.cjs"]
