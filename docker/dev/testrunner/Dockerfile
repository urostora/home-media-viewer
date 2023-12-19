FROM node:20 as testrunner

RUN apt update && apt install gnupg wget -y && \
  wget --quiet --output-document=- https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /etc/apt/trusted.gpg.d/google-archive.gpg && \
  sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' && \
  apt update && \
  apt install google-chrome-stable -y --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

ENV TS_NODE_PROJECT /home/node/app/tsconfig.json

USER node

WORKDIR /home/node/app

VOLUME /home/node/app

