FROM node:18-alpine

# Cron setup to run background process scheduled
COPY --chmod=0777 ./home-media-viewer/runBackgroundProcess.sh /home/node/app/
RUN echo "*/3 * * * * /home/node/app/runBackgroundProcess.sh >> /var/log/cron.log 2>&1" >> /var/spool/cron/crontabs/root
RUN touch /var/log/cron.log

# Prepare app
WORKDIR /home/node/app
ENV NODE_ENV=development

RUN mkdir -p /mnt/storage
RUN chown -R node:node /mnt/storage

# COPY ./home-media-viewer/* .

EXPOSE 3000
VOLUME /mnt/storage
VOLUME /home/node/app

USER root
ENV PORT 3000

CMD crond && npm run dev;