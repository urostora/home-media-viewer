FROM node:20

WORKDIR /home/node/app
ENV WORKDIR=/home/node/app

# install cron daemon
RUN apt update \
    && apt -y install cron

RUN echo "*/3 * * * *   root   /home/node/app/runBackgroundProcess.sh >> /var/log/cron.log 2>&1" >> /etc/crontab \
    && touch /var/log/cron.log

# Prepare app
ENV NODE_ENV=development

RUN mkdir -p /mnt/storage
RUN chown -R node:node /mnt/storage

EXPOSE 3000
VOLUME /mnt/albums
VOLUME /mnt/storage
VOLUME /home/node/app

USER root
ENV PORT 3000

# CMD crond && npm run dev
CMD env >> /etc/environment && service cron start && npm run dev
