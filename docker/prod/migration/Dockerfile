FROM node:26.12.1-trixie@sha256:a98e6fda54fdbb22d4238054cca9a2a113bcd1191c09193a535aae22f400aa8e AS dependencies
WORKDIR /home/node/app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY ./home-media-viewer/package.json ./home-media-viewer/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY ./home-media-viewer/prisma ./prisma
RUN ./node_modules/.bin/prisma generate

FROM dependencies AS migration
ENV TS_NODE_PROJECT=/home/node/app/tsconfig.json
# Only migration/bootstrap inputs are needed; no application build outputs.
COPY ./home-media-viewer/tsconfig.json ./
# Bootstrap imports the shared user/password helpers and their TypeScript dependencies.
COPY ./home-media-viewer/src ./src
CMD ["npx", "--no-install", "prisma", "migrate", "deploy"]
