FROM node:18 as dependencies
WORKDIR /home/node/app
RUN [ "npm", "install" ]
#RUN [ "npx", "prisma", "generate" ]

FROM node:18 as app
CMD [ "npm", "run", "dev"]