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

`docker-compose exec app sh -c "npx ts-node -r tsconfig-paths/register ./src/backgroundProcesses/updateMetadata.ts"`

## Run tests

`docker-compose exec app npx jest`

### Run test on a separate container

`docker-compose run --rm dependencies bash -c "npm run test"`

### Run specific test

`docker-compose run --rm dependencies bash -c "npx jest -t 'AlbumDetails'"`

## Developer environment

### Run tests on developer environment

#### Run all tests on developer environment

`docker-compose run --rm testrunner bash -c "npm run test"`

#### Run specific test on developer environment

`docker-compose run --rm testrunner bash -c "npx jest -t 'Google'"`

## Test environment

### build

#### app

`docker-compose --file docker-compose-test.yml --env-file .env-test build app`

#### migration

`docker-compose --file docker-compose-test.yml --env-file .env-test build migration`

### Database commands

#### Update database

`docker-compose --file docker-compose-test.yml --env-file .env-test run --rm migration bash -c "npx prisma migrate deploy"`

#### Set initial data (seed)

`docker-compose --file docker-compose-test.yml --env-file .env-test run --rm migration bash -c "npx prisma db seed"`

## Production build

`docker-compose --file docker-compose-prod.yml --env-file .env-prod build app`

## Run production app

`docker-compose --file docker-compose-prod.yml --env-file .env-prod up -d`
