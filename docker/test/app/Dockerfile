FROM node:20 as dependencies

WORKDIR /home/node/app
COPY ./home-media-viewer/package.json .
COPY ./home-media-viewer/package-lock.json .
RUN npm install


FROM node:20 as appbuilder

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


FROM node:20-alpine as proddependencies

WORKDIR /home/node/app

ENV NODE_ENV=production

COPY ./home-media-viewer/package*.json .
COPY ./home-media-viewer/prisma ./prisma
RUN npm install --omit=dev

RUN npx prisma generate


FROM node:18-alpine as app

# Cron setup to run background process scheduled
COPY --chmod=0777 ./home-media-viewer/runBackgroundProcess.sh /home/node/app/
RUN echo "*/5 * * * * /home/node/app/runBackgroundProcess.sh >> /var/log/cron.log 2>&1" >> /var/spool/cron/crontabs/root
RUN touch /var/log/cron.log

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TS_NODE_PROJECT /home/node/app/tsconfig.json

WORKDIR /home/node/app

COPY --from=proddependencies /home/node/app/node_modules ./node_modules
COPY --from=appbuilder /home/node/app/node_modules/.prisma/client ./node_modules/.prisma/client
COPY --from=appbuilder /home/node/app/.next ./.next
COPY --from=appbuilder /home/node/app/public ./public
COPY ./home-media-viewer/package.json .
COPY ./home-media-viewer/prisma ./prisma

RUN mkdir -p /mnt/storage
RUN chown -R node:node /mnt/storage

######################################################
# Comment out the following if test suite was changed
######################################################
# ARG CACHEBUST=1

COPY --chown=node:node ./test/files /mnt/albums

USER root

ENV PORT 3000

EXPOSE 3000
VOLUME /mnt/storage

CMD crond && npm start
