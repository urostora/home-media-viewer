FROM node:26.12.1-trixie@sha256:a98e6fda54fdbb22d4238054cca9a2a113bcd1191c09193a535aae22f400aa8e

RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update --error-on=any \
    && apt-get install -y --no-install-recommends ffmpeg cron \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/node/app
ENV WORKDIR=/home/node/app

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
