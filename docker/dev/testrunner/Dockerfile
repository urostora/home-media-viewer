# Base images are supplied by Compose from docker/base-images.yml.
ARG NODE_SLIM_IMAGE
FROM ${NODE_SLIM_IMAGE} AS testrunner
ARG DEBIAN_MIRROR=https://deb.debian.org
# Slim omits CA certificates; bootstrap HTTPS with Node's bundled Mozilla roots.
RUN mkdir -p /etc/ssl/certs \
    && node -e 'require("node:fs").writeFileSync("/etc/ssl/certs/ca-certificates.crt", require("node:tls").rootCertificates.join("\n") + "\n")' \
    && sed -i "s|http://deb.debian.org/debian$|${DEBIAN_MIRROR}/debian|; s|http://deb.debian.org/debian-security$|https://deb.debian.org/debian-security|" /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::https::CaInfo=/etc/ssl/certs/ca-certificates.crt -o Acquire::Retries=3 -o Acquire::https::Timeout=30 update --error-on=any && apt-get -o Acquire::https::CaInfo=/etc/ssl/certs/ca-certificates.crt -o Acquire::Retries=3 -o Acquire::https::Timeout=30 install -y --no-install-recommends ca-certificates openssl chromium && rm -rf /var/lib/apt/lists/*
ENV TS_NODE_PROJECT=/home/node/app/tsconfig.json PUPPETEER_SKIP_DOWNLOAD=true PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /home/node/app
RUN mkdir -p /home/node/scripts
