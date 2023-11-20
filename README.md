# Home Media Viewer

[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)[![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/en)[![Next JS](https://img.shields.io/badge/Next-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)[![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)](https://react.dev/)[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)](https://www.prisma.io/)[![MariaDB](https://img.shields.io/badge/MariaDB-003545?style=for-the-badge&logo=mariadb&logoColor=white)](https://mariadb.org/)[![Jest](https://img.shields.io/badge/-jest-%23C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io/)

A fully Docker-based NodeJs project provides web access to media files (images and videos) attached to the container. The application creates thumbnail images for the media content and extracts related metadata from them.

## Architecture

- Web
  - Next.Js/based app with React front-end
- Background process
  - Uses the same container as the web application
  - Indexes new and changed contents
- Database
  - MariaDB
  - Accessed through the Prisma ORM library

## Usage

### Prerequests

This project requires only Docker to run.

### Media content

Media content should be arranged into directories, like the following (albums can be deeper too):

```text
root <=== this directory should be mount to the container
 |-album1
 |  |- directory1
 |  |   |- image111.jpg
 |  |- image11.jpg
 |  |- video11.mp4
 |- album2
     |- image2.jpg
     |- video2.mkv
...
```

### Container setup

Database files, media content and index file storage should be attached as a volume to the container:

```yml
# example
services:
    dev-db:
        # ...
        volumes:
            - home-media-dev-db-storage:/var/lib/mysql
    # ...
    app:
        # ...
        volumes:
            - ./static:${APP_ALBUM_ROOT_PATH}:ro # mount media content, target is /mnt/albums by default
            - home-media-dev-index-storage:${APP_STORAGE_PATH} # it's /mnt/storage by default
# ...

volumes:
  home-media-dev-index-storage:

  home-media-dev-db-storage:
```

### Developer environment

#### Before first use

- Set environment variables in .env file

```text
# Web application port on host
WEB_PORT=23080
...
# Administrator user credentials - used by the db seed process
ADMIN_EMAIL=admin@admin.com
ADMIN_PASSWORD=P4ssw0rd
...
# when HOSTNAME is set, app uses secure cookie (HTTPS connection required - used in production)
HOSTNAME=
```

- Load dependencies

`docker-compose run --rm dependencies bash -c "npm install"`

- ORM (Prisma) setup

`docker-compose run --rm dependencies bash -c "npx prisma generate"`

- Start containers

`docker-compose up -d`

- Init database

`docker-compose run --rm dependencies bash -c "npx prisma migrate reset --force"`

#### When initiated before, just start containers

`docker-compose up -d`

#### Using developer web app

[Web access](http://localhost:23080/)

1. Log in with credentials set in environment file
2. Open "Browse" site
3. Choose "Add album" in context menu
4. Background process indexes files in albums
   1. This can take a few minutes

#### Containers

- **db**
  - MariaDB database
- **app**
  - Web and API services
- **background**
  - Runs background processing jobs
- **testrunner**
  - test suite can be run in this container
  - `docker-compose run --rm dependencies bash -c "npm run test"`
- **dependencies**
  - Run custom node commands, like
    - Node version `docker-compose run --rm dependencies bash -c "node --version"`
    - npm install `docker-compose run --rm dependencies bash -c "npm install"`
    - Prisma commands
      - Generate schema classes
        `docker-compose run --rm dependencies bash -c "npx prisma generate"`
      - Create migrate script from schema changes
        `docker-compose run --rm dependencies bash -c "npx prisma migrate dev --name=init"`
      - Apply schema changes
        `docker-compose run --rm dependencies bash -c "npx prisma migrate deploy"`

##### Dependencies

This container is used to run casual node commands in the development process

Node version
`docker-compose run --rm dependencies bash -c "node --version"`

Install npm packages
`docker-compose run --rm dependencies bash -c "npm install"`

Prisma commands

`docker-compose run --rm dependencies bash -c "npx prisma generate"`

`docker-compose run --rm dependencies bash -c "npx prisma migrate dev --name=init"`

`docker-compose run --rm dependencies bash -c "npx prisma db push"`

#### Testing

### Run all tests on developer environment

`docker-compose run --rm testrunner bash -c "npm run test"`

#### Run specific test on developer environment

`docker-compose run --rm testrunner bash -c "npx jest -t 'Google'"`

## Test environment

Test environment contains a production app and a test runner container.
To use this environment, set docker-compose parameters to the following:

`--file docker-compose-test.yml --env-file .env-test`.

App container contains the test data suite from `./test/files` directory.

### Containers in test environment

- app
- db
- migration
  - Runs database update / seed scripts
- testrunner
  - Prepares app to run UI tests
  - Runs test suite

### Start containers

`docker-compose --file docker-compose-test.yml --env-file .env-test up -d`

### Init test data

- Initialize database
  - Update (create) tables
  `docker-compose --file docker-compose-test.yml --env-file .env-test run --rm migration bash -c "npx prisma migrate deploy"`
  - Set initial data (seed)
  `docker-compose --file docker-compose-test.yml --env-file .env-test run --rm migration bash -c "npx prisma db seed"`
- Process test data suite
  `docker-compose --file docker-compose-test.yml --env-file .env-test run --rm testrunner bash -c "./scripts/initTestData.sh"`

### Run tests

`docker-compose --file docker-compose-test.yml --env-file .env-test run --rm testrunner bash -c "npm run test"`

### Reset test environment

To clear database and index file content, do the following:

- reset (clear and re-seed) the database
  - `docker-compose --file docker-compose-test.yml --env-file .env-test run --rm migration bash -c "npx prisma migrate reset --force"`
- remove thumbnail files
  - `docker-compose --file docker-compose-test.yml --env-file .env-test exec app sh -c "rm -R /mnt/storage/*"`

After that the test datasuite can be reprocessed.

## Production environment

Before initiating running production app, change keys and passwords in the environment file (.env-prod).

- build app
`docker-compose --file docker-compose-prod.yml --env-file .env-prod build app`
- Run production app
`docker-compose --file docker-compose-prod.yml --env-file .env-prod up -d`
