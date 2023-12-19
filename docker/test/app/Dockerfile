FROM node:20 as devdependencies

WORKDIR /home/node/app
COPY ./home-media-viewer/package*.json .
RUN npm install


FROM node:20 as appbuilder

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

WORKDIR /home/node/app

COPY --chown=node:node --chmod=775 ./home-media-viewer ./
COPY --chown=node:node --chmod=775 ./home-media-viewer/next.config.js.prod ./next.config.js

COPY --from=devdependencies /home/node/app/node_modules /home/node/app/node_modules
COPY --from=devdependencies /home/node/app/package.json .

RUN npx prisma generate
RUN npm run build


FROM node:20 as proddependencies

WORKDIR /home/node/app

ENV NODE_ENV=production

COPY ./home-media-viewer/package*.json .
COPY ./home-media-viewer/prisma ./prisma

RUN npm install --omit=dev \
    && npx prisma generate


FROM node:20 as app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TS_NODE_PROJECT /home/node/app/tsconfig.json

WORKDIR /home/node/app

# install cron daemon
RUN apt update \
    && apt -y install cron \
    && echo "*/3 * * * *   root   /home/node/app/runBackgroundProcess.sh >> /var/log/cron.log 2>&1" >> /etc/crontab \
    && touch /var/log/cron.log \
    && mkdir -p /mnt/storage \
    && chown -R node:node /mnt/storage

COPY --from=proddependencies /home/node/app/node_modules ./node_modules
COPY --from=appbuilder /home/node/app/node_modules/.prisma/client ./node_modules/.prisma/client
COPY --from=appbuilder /home/node/app/.next ./.next
COPY --from=appbuilder /home/node/app/public ./public
COPY ./home-media-viewer/package.json .
COPY ./home-media-viewer/prisma ./prisma
COPY --chmod=0777 ./home-media-viewer/runBackgroundProcess.sh /home/node/app/

USER root

ENV PORT 3000

EXPOSE 3000
VOLUME /mnt/albums
VOLUME /mnt/storage

CMD env >> /etc/environment && service cron start && npm start
