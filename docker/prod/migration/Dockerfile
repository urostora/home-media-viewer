FROM node:20 as dependencies

WORKDIR /home/node/app
COPY ./home-media-viewer .
RUN npm install
RUN npx prisma generate


FROM node:20 as migration

ENV TS_NODE_PROJECT /home/node/app/tsconfig.json

WORKDIR /home/node/app

COPY ./home-media-viewer .
COPY --from=dependencies /home/node/app/node_modules ./node_modules
