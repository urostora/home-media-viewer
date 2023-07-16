FROM node:18-alpine

ENV NODE_ENV=development

RUN mkdir -p /mnt/storage
RUN chown -R node:node /mnt/storage

WORKDIR /home/node/app

USER node
EXPOSE 3000
ENV PORT 3000
CMD ["npm", "run", "dev"]