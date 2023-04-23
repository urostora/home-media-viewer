# Home media server

Docker-based project provides web access to media files in our storage.

## Usage

### Prerequests

This project requires only Docker to run.

### Run developer environment

#### Before first use run these

`docker-compose run --rm dependencies bash -c "npm install"`

`docker-compose run --rm dependencies bash -c "npx prisma generate"`

`docker-compose up -d`

`docker-compose run --rm dependencies bash -c "npx prisma migrate reset --force"`

#### When initiated before, just start containers

`docker-compose up -d`

#### Open urls

[Web access](http://localhost:23000/)

[API access](http://localhost:23000/api/hello)

### Run commands on "dependencies" helper container

Node version
`docker-compose run --rm dependencies bash -c "node --version"`

Install npm packages
`docker-compose run --rm dependencies bash -c "npm install"`

Prisma commands

`docker-compose run --rm dependencies bash -c "npx prisma generate"`

`docker-compose run --rm dependencies bash -c "npx prisma migrate dev --name=init"`

`docker-compose run --rm dependencies bash -c "npx prisma db push"`

## Background processes

Update metadata

`docker-compose exec app sh -c "./node_modules/.bin/ts-node ./src/backgroundProcesses/updateMetadata.ts"`
