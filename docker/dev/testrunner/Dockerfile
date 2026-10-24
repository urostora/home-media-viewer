FROM node:26.12.1-trixie@sha256:a98e6fda54fdbb22d4238054cca9a2a113bcd1191c09193a535aae22f400aa8e AS testrunner
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update --error-on=any && apt-get install -y --no-install-recommends chromium && rm -rf /var/lib/apt/lists/*
ENV TS_NODE_PROJECT=/home/node/app/tsconfig.json PUPPETEER_SKIP_DOWNLOAD=true PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /home/node/app
RUN mkdir -p /home/node/scripts
VOLUME /home/node/app
VOLUME /home/node/scripts
