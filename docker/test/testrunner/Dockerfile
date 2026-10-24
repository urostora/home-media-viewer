FROM node:26.12.1-trixie@sha256:a98e6fda54fdbb22d4238054cca9a2a113bcd1191c09193a535aae22f400aa8e AS dependencies
WORKDIR /home/node/app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY ./home-media-viewer/package.json ./home-media-viewer/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY ./home-media-viewer/prisma ./prisma
RUN ./node_modules/.bin/prisma generate

FROM node:26.12.1-trixie@sha256:a98e6fda54fdbb22d4238054cca9a2a113bcd1191c09193a535aae22f400aa8e AS browser
# Debian Chromium supports amd64 and arm64; Puppeteer uses it instead of downloading a browser.
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update --error-on=any && apt-get install -y --no-install-recommends chromium && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_SKIP_DOWNLOAD=true TS_NODE_PROJECT=/home/node/app/tsconfig.json PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

FROM browser AS testrunner
WORKDIR /home/node/app
COPY --from=dependencies --chown=node:node /home/node/app/node_modules ./node_modules
COPY --chown=node:node ./home-media-viewer ./
COPY --chown=node:node --chmod=755 ./scripts/test/initTestData.sh ./scripts/initTestData.sh
COPY --chown=node:node ./scripts/test/initTestData.mjs ./scripts/initTestData.mjs
RUN chown node:node /home/node/app
USER node
