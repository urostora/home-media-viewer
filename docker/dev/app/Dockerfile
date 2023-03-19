FROM node:18-alpine as dependencies
RUN apk add --no-cache libc6-compat

WORKDIR /home/node/app
RUN [ "npm", "install" ]
RUN [ "npx", "prisma", "generate" ]

FROM node:18-alpine as app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

USER nextjs
