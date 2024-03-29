# Home Media Viewer

[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)[![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/en)[![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)](https://react.dev/)[![MariaDB](https://img.shields.io/badge/MariaDB-003545?style=for-the-badge&logo=mariadb&logoColor=white)](https://mariadb.org/)[![Next JS](https://img.shields.io/badge/Next-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)](https://www.prisma.io/)[![Jest](https://img.shields.io/badge/-jest-%23C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io/)

A fully Docker-based NodeJs project provides web access to media files (images and videos) attached to the container. The application creates thumbnail images for the media content and extracts related metadata from them.

Media files can be filtered by extracted metadata like date or location.

![Album list](https://hmv.devati.net/docs/content-list.jpg)

![Search by ](https://hmv.devati.net/docs/search-by-location.jpg)

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

### Hosting

[Self-hosted HMV app](https://hmv.devati.net)

```text
User: guest@guest.net
Password: Secure+Guest+Password1
```

### Prerequests

This project requires only Docker to run.

### Media content

The default media content is the test suite.

Custom media content should be arranged into directories, like the following (albums can be deeper too) and attached to the app container:

```text
root <=== this directory should be attached to the container
 |-album1
 |  |- internalAlbum1
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
            - ./test/files:${APP_ALBUM_ROOT_PATH}:ro # mount media content, target is /mnt/albums by default
            - home-media-dev-index-storage:${APP_STORAGE_PATH} # it's /mnt/storage by default
# ...

volumes:
  home-media-dev-index-storage:

  home-media-dev-db-storage:
```

### Developer environment

#### Before first use

- **Set environment variables in .env file**

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

- **Load dependencies**
  `docker-compose run --rm dependencies bash -c "npm install"`
- **ORM (Prisma) setup**
  `docker-compose run --rm dependencies bash -c "npx prisma generate"`
- **Load database schema and run seed command**
  `docker-compose run --rm dependencies bash -c "npx prisma migrate reset --force"`
- **Start containers**
  `docker-compose up -d`
- **Initialize test data** (optional, works only with default test suite)
  `docker-compose run --rm testrunner bash -c "cd ../scripts && ./initTestData.sh"`

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
    `docker-compose run --rm testrunner bash -c "npm run test"`
- **dependencies**
  - Run custom node commands, like
    - Node version `docker-compose run --rm dependencies sh -c "node --version"`
    - npm install `docker-compose run --rm dependencies sh -c "npm install"`
    - Prisma commands
      - Generate schema classes
        `docker-compose run --rm dependencies bash -c "npx prisma generate"`
      - Create migrate script from schema changes
        `docker-compose run --rm dependencies bash -c "npx prisma migrate dev --name=init"`
      - Apply schema changes
        `docker-compose run --rm dependencies bash -c "npx prisma migrate deploy"`
      - Reset database
        `docker-compose run --rm dependencies bash -c "npx prisma migrate reset --force"`
    - Run linter
      - `docker-compose run --rm dependencies bash -c "npm run lint"`

##### Dependencies

This container is used to run commands required in the development process, so there is no need to install node to the host machine.

Node version
`docker-compose run --rm dependencies sh -c "node --version"`

Run npm commands
`docker-compose run --rm dependencies sh -c "npm install"`

Run Prisma commands

- Generate database schema
`docker-compose run --rm dependencies sh -c "npx prisma generate"`
- Create migration script to schema changes
`docker-compose run --rm dependencies sh -c "npx prisma migrate dev --name=schema-update-description"`
- Deploy schema changes to the database
`docker-compose run --rm dependencies sh -c "npx prisma migrate deploy"`

### Test suite development

#### Preparing environment

Before changing test suite, be sure, that app container uses proper test data and database.

- **Set up test database and connect test data to albums mount point**

  docker-compose.yml

   ``` yml
    services:
    # ...
    app:
        # ...
        volumes:
            - ./test/files:${APP_ALBUM_ROOT_PATH}:ro
   ```

  .env

  ``` text
  # database name is only an example
  MARIADB_DATABASE=home_media_test
  ```

- **Run database initialization script**
   `docker-compose run --rm dependencies bash -c "npx prisma migrate reset --force"`
- **Remove thumbnails created before**
   `docker-compose exec app sh -c "rm -R /mnt/storage/*"`
- **Init test suite**
  `docker-compose run --rm testrunner bash -c "cd ../scripts && ./initTestData.sh"`

#### Run tests on developer environment

Developer environment runs test cases much slower due to the attached file system.

- All tests
`docker-compose run --rm testrunner bash -c "npx jest --runInBand --collect-coverage"`
- Specific test(s)
`docker-compose run --rm testrunner bash -c "npx jest --runInBand -t 'Google'"`

## Test environment

Test environment contains a production app and a test runner container.
To use this environment, set docker-compose parameters to the following:

`--file docker-compose-test.yml --env-file .env-test`.

 Test suite at `./test/files` directory are attached to the app- and background containers (`/mnt/albums`).

### Containers in test environment

- app
  - app image is built with production script- app
- background
  - same as app container, runs background processes
- db
- migration
  - Runs database update / seed scripts
- testrunner
  - Prepares app to run UI tests
  - Runs test suite

### First use / automated test run

1. **Build containers**
  `docker-compose --file docker-compose-test.yml --env-file .env-test build`
2. **Reset database**
  `docker-compose --file docker-compose-test.yml --env-file .env-test run --rm migration bash -c "npx prisma migrate reset --force"`
3. **Start containers**
  `docker-compose --file docker-compose-test.yml --env-file .env-test up -d`
4. **Clear previous index files**
   `docker-compose --file docker-compose-test.yml --env-file .env-test exec app sh -c "rm -R /mnt/storage/*"`
5. **Run test suite pre-processor script**
   `docker-compose --file docker-compose-test.yml --env-file .env-test run --rm testrunner bash -c "./scripts/initTestData.sh"`
6. **Run test suite**
   `docker-compose --file docker-compose-test.yml --env-file .env-test run --rm testrunner bash -c "npm run test"`

### Start containers

`docker-compose --file docker-compose-test.yml --env-file .env-test up -d`

### Reset test data

- Initialize database
  - Update (create) tables
  `docker-compose --file docker-compose-test.yml --env-file .env-test run --rm migration bash -c "npx prisma migrate reset --force"`
  - Set initial data (seed)
  `docker-compose --file docker-compose-test.yml --env-file .env-test run --rm migration bash -c "npx prisma db seed"`
- Process test data suite
  `docker-compose --file docker-compose-test.yml --env-file .env-test run --rm testrunner bash -c "./scripts/initTestData.sh"`

### Run tests

`docker-compose --file docker-compose-test.yml --env-file .env-test run --rm testrunner bash -c "npm run test"`

## Production environment

Before initiating running production app, change keys and passwords in the environment file (.env-prod) or create a new compose file with a new environment.

1. **Build app**
`docker-compose --file docker-compose-prod.yml --env-file .env-prod build app`
2. **Run DB migration scripts**
`docker-compose --file docker-compose-prod.yml --env-file .env-prod bash -c "npx prisma migrate deploy"`
3. **Run production app**
`docker-compose --file docker-compose-prod.yml --env-file .env-prod up -d`
