FROM node:18-alpine as dependencies

WORKDIR /home/node/app
COPY ./home-media-viewer/package.json .
COPY ./home-media-viewer/package-lock.json .
RUN npm install


FROM node:18-alpine as builder

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

WORKDIR /home/node/app

COPY --chown=node:node --chmod=775 ./home-media-viewer ./
COPY --chown=node:node --chmod=775 ./home-media-viewer/next.config.js.prod ./next.config.js

COPY --from=dependencies /home/node/app/node_modules /home/node/app/node_modules
COPY --from=dependencies /home/node/app/package.json .

# RUN chown -R node:node /home
# RUN chmod -R 774 /home

RUN npx prisma generate
RUN npm run build

FROM node:18-alpine as app

# Cron setup to run background process scheduled
COPY --chmod=0777 ./home-media-viewer/runBackgroundProcess.sh /home/node/app/
RUN echo "*/5 * * * * /home/node/app/runBackgroundProcess.sh >> /var/log/cron.log 2>&1" >> /var/spool/cron/crontabs/root
RUN touch /var/log/cron.log

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TS_NODE_PROJECT /home/node/app/tsconfig.json

WORKDIR /home/node/app

COPY --from=builder --chown=node:node /home/node/app/.next ./.next
COPY --from=builder --chown=node:node /home/node/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /home/node/app/public ./public
COPY --chown=node:node ./home-media-viewer/package.json .
COPY --chown=node:node ./home-media-viewer/prisma ./prisma

RUN mkdir -p /mnt/storage
RUN chown -R node:node /mnt/storage

USER root

EXPOSE 3000
ENV PORT 3000

CMD crond && npm start
