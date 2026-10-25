# Base images are supplied by Compose from docker/base-images.yml.
ARG NODE_SLIM_IMAGE
FROM ${NODE_SLIM_IMAGE} AS migration
ARG DEBIAN_MIRROR=https://deb.debian.org
# Slim omits CA certificates; bootstrap HTTPS with Node's bundled Mozilla roots.
RUN mkdir -p /etc/ssl/certs \
    && node -e 'require("node:fs").writeFileSync("/etc/ssl/certs/ca-certificates.crt", require("node:tls").rootCertificates.join("\n") + "\n")' \
    && sed -i "s|http://deb.debian.org/debian$|${DEBIAN_MIRROR}/debian|; s|http://deb.debian.org/debian-security$|https://deb.debian.org/debian-security|" /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::https::CaInfo=/etc/ssl/certs/ca-certificates.crt -o Acquire::Retries=3 -o Acquire::https::Timeout=30 update --error-on=any \
    && apt-get -o Acquire::https::CaInfo=/etc/ssl/certs/ca-certificates.crt -o Acquire::Retries=3 -o Acquire::https::Timeout=30 install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /home/node/app
ENV TS_NODE_PROJECT=/home/node/app/tsconfig.json PRISMA_SKIP_POSTINSTALL_GENERATE=true
COPY ./docker/prod/migration/package.json ./docker/prod/migration/package-lock.json ./
RUN --mount=type=cache,id=hmv-npm,target=/root/.npm,sharing=locked npm ci --no-audit --no-fund
COPY ./home-media-viewer/prisma/schema.prisma ./prisma/schema.prisma
RUN ./node_modules/.bin/prisma generate
COPY ./home-media-viewer/tsconfig.json ./
COPY ./home-media-viewer/prisma/seed.ts ./prisma/seed.ts
COPY ./home-media-viewer/prisma/migrations ./prisma/migrations
COPY ./home-media-viewer/src/utils/passwordHelper.ts ./src/utils/passwordHelper.ts
CMD ["npx", "--no-install", "prisma", "migrate", "deploy"]
