FROM node:18-alpine as dependencies
WORKDIR /home/node/app
COPY ./home-media-viewer/package.json .
COPY ./home-media-viewer/package-lock.json .
RUN npm install


FROM node:18-alpine as builder
WORKDIR /home/node/app
COPY --from=dependencies /home/node/app/node_modules /home/node/app/node_modules
COPY ./home-media-viewer ./
COPY ./home-media-viewer/next.config.js.prod ./next.config.js
# RUN chown -R node:node /home
# RUN chmod -R 774 /home
RUN npx prisma generate
RUN npm run build

FROM node:18-alpine as deploy
ENV NODE_ENV production
WORKDIR /home/node/app

COPY --from=builder /home/node/app/.next ./.next
COPY --from=builder /home/node/app/package.json .

RUN chown -R node:node /home/node/app
# RUN chmod -R 774 /home/node/app

RUN mkdir -p /mnt/storage
RUN chown -R node:node /mnt/storage
