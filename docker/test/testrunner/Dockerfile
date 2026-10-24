FROM node:26.12.1-trixie@sha256:a98e6fda54fdbb22d4238054cca9a2a113bcd1191c09193a535aae22f400aa8e AS dependencies
WORKDIR /home/node/app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY ./home-media-viewer/package.json ./home-media-viewer/package-lock.json ./
RUN --mount=type=cache,id=hmv-npm,target=/root/.npm,sharing=locked npm ci --no-audit --no-fund
COPY ./home-media-viewer/prisma/schema.prisma ./prisma/schema.prisma
RUN ./node_modules/.bin/prisma generate

FROM node:26.12.1-trixie-slim@sha256:36793bcbb160a6a16cede1e62b93f84e26b78a972a8a4c0b879c1c12f22761ec AS browser
# Debian Chromium supports amd64 and arm64; Puppeteer uses it instead of downloading a browser.
ARG DEBIAN_MIRROR=https://deb.debian.org
# Slim omits CA certificates; bootstrap HTTPS with Node's bundled Mozilla roots.
RUN mkdir -p /etc/ssl/certs \
    && node -e 'require("node:fs").writeFileSync("/etc/ssl/certs/ca-certificates.crt", require("node:tls").rootCertificates.join("\n") + "\n")' \
    && sed -i "s|http://deb.debian.org/debian$|${DEBIAN_MIRROR}/debian|; s|http://deb.debian.org/debian-security$|https://deb.debian.org/debian-security|" /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::https::CaInfo=/etc/ssl/certs/ca-certificates.crt -o Acquire::Retries=3 -o Acquire::https::Timeout=30 update --error-on=any && apt-get -o Acquire::https::CaInfo=/etc/ssl/certs/ca-certificates.crt -o Acquire::Retries=3 -o Acquire::https::Timeout=30 install -y --no-install-recommends ca-certificates openssl chromium && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_SKIP_DOWNLOAD=true TS_NODE_PROJECT=/home/node/app/tsconfig.json PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

FROM browser AS testrunner
WORKDIR /home/node/app
COPY --from=dependencies --chown=node:node /home/node/app/node_modules ./node_modules
COPY --chown=node:node ./home-media-viewer ./
COPY --chown=node:node --chmod=755 ./scripts/test/initTestData.sh ./scripts/initTestData.sh
COPY --chown=node:node ./scripts/test/initTestData.mjs ./scripts/initTestData.mjs
RUN chown node:node /home/node/app
USER node
