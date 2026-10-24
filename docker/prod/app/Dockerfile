FROM node:26.12.1-trixie@sha256:a98e6fda54fdbb22d4238054cca9a2a113bcd1191c09193a535aae22f400aa8e AS dependencies
WORKDIR /home/node/app
ENV PUPPETEER_SKIP_DOWNLOAD=true
# Install from the lockfile before copying source to preserve this cache layer.
COPY ./home-media-viewer/package.json ./home-media-viewer/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY ./home-media-viewer/prisma ./prisma
RUN ./node_modules/.bin/prisma generate

FROM dependencies AS builder
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY ./home-media-viewer ./
COPY ./home-media-viewer/next.config.js.prod ./next.config.js
RUN APP_SESSION_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')" npm run build

FROM dependencies AS runtime-dependencies
# Prune the locked tree after generation; no runtime Prisma CLI download/install.
# npm retains some development tools as optional peers; they are not used by next start.
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund \
    && rm -rf node_modules/prisma node_modules/typescript \
    && rm -f node_modules/.bin/prisma node_modules/.bin/tsc node_modules/.bin/tsserver

FROM node:26.12.1-trixie@sha256:a98e6fda54fdbb22d4238054cca9a2a113bcd1191c09193a535aae22f400aa8e AS app
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update --error-on=any && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
WORKDIR /home/node/app
COPY --from=runtime-dependencies --chown=node:node /home/node/app/node_modules ./node_modules
COPY --from=dependencies --chown=node:node /home/node/app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /home/node/app/.next ./.next
COPY --from=builder --chown=node:node /home/node/app/next.config.js ./next.config.js
COPY --chown=node:node ./home-media-viewer/public ./public
COPY --chown=node:node ./home-media-viewer/package.json ./home-media-viewer/runBackgroundScheduler.mjs ./home-media-viewer/validateProductionConfig.mjs ./
RUN mkdir -p /mnt/storage && chown node:node /mnt/storage
USER node
EXPOSE 3000
VOLUME /mnt/storage
CMD ["sh", "-ec", "node validateProductionConfig.mjs && exec node node_modules/next/dist/bin/next start"]
