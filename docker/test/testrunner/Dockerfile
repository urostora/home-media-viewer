FROM node:20 as devdependencies

WORKDIR /home/node/app
COPY ./home-media-viewer .
RUN npm install
RUN npx prisma generate


FROM node:20 as testrunner

ENV TS_NODE_PROJECT /home/node/app/tsconfig.json

# add headless browser for puppeteer tests
RUN apt-get update && apt-get install gnupg wget -y && \
  wget --quiet --output-document=- https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /etc/apt/trusted.gpg.d/google-archive.gpg && \
  sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' && \
  apt-get update && \
  apt-get install google-chrome-stable -y --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /home/node/app

RUN chown -R node:node /home/node

COPY --from=devdependencies --chown=node:node /home/node/app/node_modules ./node_modules
COPY --chown=node:node ./home-media-viewer .

######################################################
# Comment out the following when the init script was changed
######################################################
# ARG CACHEBUST=1

COPY --chown=node:node --chmod=755 ./scripts/test/initTestData.sh ./scripts/initTestData.sh

USER node