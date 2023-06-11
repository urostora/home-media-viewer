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
ENV NEXT_TELEMETRY_DISABLED 1

WORKDIR /home/node/app

COPY --from=builder --chown=node:node /home/node/app/.next ./.next
COPY --from=builder /home/node/app/node_modules ./node_modules
COPY --from=builder /home/node/app/package.json ./package.json

RUN mkdir -p /mnt/storage
RUN chown -R node:node /mnt/storage

EXPOSE 3000

ENV PORT 3000

CMD ["npm", "start"]
