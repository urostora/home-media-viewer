FROM node:26.12.1-trixie@sha256:a98e6fda54fdbb22d4238054cca9a2a113bcd1191c09193a535aae22f400aa8e

RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update --error-on=any \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/node/app
ENV WORKDIR=/home/node/app

# Prepare app
ENV NODE_ENV=development

RUN mkdir -p /mnt/storage
RUN chown -R node:node /mnt/storage

EXPOSE 3000

USER root
ENV PORT=3000

CMD ["npm", "run", "dev"]
