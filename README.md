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
  `docker compose run --rm dependencies bash -c "npm install"`
- **ORM (Prisma) setup**
  `docker compose run --rm dependencies bash -c "npx prisma generate"`
- **Load database schema and run seed command**
  `docker compose run --rm dependencies bash -c "npx prisma migrate reset --force"`
- **Start containers**
  `docker compose up -d`
- **Initialize test data** (optional, works only with default test suite)
  `docker compose run --rm testrunner bash -c "cd ../scripts && ./initTestData.sh"`

#### When initiated before, just start containers

`docker compose up -d`

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
    `docker compose run --rm testrunner bash -c "npm run test"`
- **dependencies**
  - Run custom node commands, like
    - Node version `docker compose run --rm dependencies sh -c "node --version"`
    - npm install `docker compose run --rm dependencies sh -c "npm install"`
    - Prisma commands
      - Generate schema classes
        `docker compose run --rm dependencies bash -c "npx prisma generate"`
      - Create migrate script from schema changes
        `docker compose run --rm dependencies bash -c "npx prisma migrate dev --name=init"`
      - Apply schema changes
        `docker compose run --rm dependencies bash -c "npx prisma migrate deploy"`
      - Reset database
        `docker compose run --rm dependencies bash -c "npx prisma migrate reset --force"`
    - Run linter
      - `docker compose run --rm dependencies bash -c "npm run lint"`

##### Dependencies

This container is used to run commands required in the development process, so there is no need to install node to the host machine.

Node version
`docker compose run --rm dependencies sh -c "node --version"`

Run npm commands
`docker compose run --rm dependencies sh -c "npm install"`

Run Prisma commands

- Generate database schema
`docker compose run --rm dependencies sh -c "npx prisma generate"`
- Create migration script to schema changes
`docker compose run --rm dependencies sh -c "npx prisma migrate dev --name=schema-update-description"`
- Deploy schema changes to the database
`docker compose run --rm dependencies sh -c "npx prisma migrate deploy"`

### Test suite development

#### Preparing environment

Before changing test suite, be sure, that app container uses proper test data and database.

- **Set up test database and connect test data to albums mount point**

  docker compose.yml

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
   `docker compose run --rm dependencies bash -c "npx prisma migrate reset --force"`
- **Remove thumbnails created before**
   `docker compose exec app sh -c "rm -R /mnt/storage/*"`
- **Init test suite**
  `docker compose run --rm testrunner bash -c "cd ../scripts && ./initTestData.sh"`

#### Run tests on developer environment

Developer environment runs test cases much slower due to the attached file system.

- All tests
`docker compose run --rm testrunner bash -c "npx jest --runInBand --collect-coverage"`
- Specific test(s)
`docker compose run --rm testrunner bash -c "npx jest --runInBand -t 'Google'"`

## Test environment

Test environment contains a production app and a test runner container.
To use this environment, set docker compose parameters to the following:

`--file docker-compose-test.yml --env-file .env-test`.

 Test suite at `./test/files` directory are attached to the app- and background containers (`/mnt/albums`).

### Containers in test environment

- app
  - app image is built with production script- app
- background
  - same as app container, runs background processes
- db
- migration
  - Defaults to schema deployment; administrator seed is an explicit separate command
- testrunner
  - Prepares app to run UI tests
  - Runs test suite

### First use / automated test run

1. **Build containers**
  `docker compose --file docker-compose-test.yml --env-file .env-test build`
2. **Reset database**
  `docker compose --file docker-compose-test.yml --env-file .env-test run --rm migration bash -c "npx prisma migrate reset --force"`
3. **Start containers**
  `docker compose --file docker-compose-test.yml --env-file .env-test up -d`
4. **Clear previous index files**
   `docker compose --file docker-compose-test.yml --env-file .env-test exec app sh -c "rm -R /mnt/storage/*"`
5. **Run test suite pre-processor script**
   `docker compose --file docker-compose-test.yml --env-file .env-test run --rm testrunner bash -c "./scripts/initTestData.sh"`
6. **Run test suite**
   `docker compose --file docker-compose-test.yml --env-file .env-test run --rm testrunner bash -c "npm run test"`

### Start containers

`docker compose --file docker-compose-test.yml --env-file .env-test up -d`

### Reset test data

- Initialize database
  - Update (create) tables
  `docker compose --file docker-compose-test.yml --env-file .env-test run --rm migration bash -c "npx prisma migrate reset --force"`
  - Set initial data (seed)
  `docker compose --file docker-compose-test.yml --env-file .env-test run --rm migration bash -c "npx prisma db seed"`
- Process test data suite
  `docker compose --file docker-compose-test.yml --env-file .env-test run --rm testrunner bash -c "./scripts/initTestData.sh"`

### Run tests

`docker compose --file docker-compose-test.yml --env-file .env-test run --rm testrunner bash -c "npm run test"`

## Production environment

Before initiating running production app, change keys and passwords in the environment file (.env-prod) or create a new compose file with a new environment.

Build the application, background, and migration images from the same revision:

```sh
docker compose --file docker-compose-prod.yml --env-file .env-prod build app background migration
```

For a **first installation**, deploy the schema, then explicitly create the administrator before starting consumers:

```sh
docker compose --file docker-compose-prod.yml --env-file .env-prod run --rm migration
docker compose --file docker-compose-prod.yml --env-file .env-prod run --rm migration npx --no-install prisma db seed
docker compose --file docker-compose-prod.yml --env-file .env-prod up -d app background scheduler
```

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the deployment environment before bootstrap. The seed requires nonempty credentials in every environment and creates the configured email with a hashed password. Rerunning it preserves an existing active administrator and its password; it fails if that email belongs to an inactive or non-admin account. Migration deployment does not run the seed automatically. Development bootstrap uses `docker compose run --rm dependencies npx --no-install prisma db seed` with credentials set in the development environment file. Test bootstrap uses `docker compose --file docker-compose-test.yml --env-file .env-test run --rm migration npx --no-install prisma db seed`.

For an **existing installation**, take a verified backup, stop consumers, build the new images, deploy migrations, and start the updated services only if migration succeeds:

```sh
docker compose --file docker-compose-prod.yml --env-file .env-prod stop scheduler app background
docker compose --file docker-compose-prod.yml --env-file .env-prod build app background migration
docker compose --file docker-compose-prod.yml --env-file .env-prod run --rm migration
# Continue only after the migration command exits successfully.
docker compose --file docker-compose-prod.yml --env-file .env-prod up -d app background scheduler
```

All three Compose configurations wait for MariaDB's `healthcheck.sh --connect --innodb_initialized` checks before migration. App/background wait for the finite migration service to exit successfully. The migration images also default to `npx --no-install prisma migrate deploy`; failures exit visibly without automatic restarts. Do not use `migrate reset` or remove database volumes during production installation or upgrades. Startup dependency gates do not stop already-running consumers if a later migration fails, which is why the upgrade procedure stops them first. Repair failed migrations deliberately using Prisma's migration recovery procedure before retrying a release.

After a temporary database outage, the shared Prisma client retries ordinary reads outside transactions at most twice, after 250 ms and 500 ms. Only connection errors P1001/P1002/P1017 are retried. Writes, raw queries, and transactions fail without replay; callers must check the operation's outcome before resubmitting a write. Prisma's connection/pool timeouts still apply to each attempt (`connect_timeout` defaults to 5 seconds and `pool_timeout` to 10 seconds; keep nonzero values in `DATABASE_URL`). Background scheduling attempts another run at its next interval. Startup gates do not provide continuous availability monitoring.

Focused database lifecycle checks (mocked seed/database failures, no running database needed):

```sh
docker compose run --rm --no-deps -v "$PWD:/workspace:ro" dependencies node --test /workspace/docker/test/database-lifecycle.test.mjs
```

### Production background scheduling

Production web and background HTTP services run as the `node` user, with Node as the foreground process. A separate `scheduler` service uses the same background image and calls `http://background:3000` every three minutes, waiting for each request to finish before the next interval. The scheduler receives only its required process token, background URL, and timeout settings; no environment dump or system cron is needed. Failures are logged and retried at the next interval.

The scheduler is included in production startup. In the test environment it is opt-in via `--profile scheduled`, so normal test initialization controls indexing explicitly. Scheduler logs are available through `docker compose --file docker-compose-prod.yml --env-file .env-prod logs scheduler`. Keep one scheduler instance per background service.

The Node 26 production image prepares `/mnt/storage` for the `node` user (UID/GID 1000). A fresh named volume inherits that ownership. An existing volume retains its own permissions, including thumbnail subdirectories, so rebuilding the image cannot repair a volume created by an older root process.

For the current `/mnt/storage` mount, check write access using the image's default non-root user:

```sh
docker compose --file docker-compose-prod.yml --env-file .env-prod run --rm --no-deps app node -e 'const fs = require("node:fs"); fs.mkdirSync("/mnt/storage/thumbnail", { recursive: true }); const probe = "/mnt/storage/thumbnail/.write-check-" + Date.now(); fs.writeFileSync(probe, "ok", { flag: "wx" }); fs.unlinkSync(probe); console.log("Storage writable by UID", process.getuid());'
```

If an existing volume has incompatible ownership, confirm that the selected Compose project and `/mnt/storage` mount refer to the intended generated storage volume. Stop consumers and perform a one-time ownership repair on that volume, then repeat the write check and start the services:

```sh
docker compose --file docker-compose-prod.yml --env-file .env-prod stop scheduler app background
docker compose --file docker-compose-prod.yml --env-file .env-prod run --rm --no-deps --user root app chown -R node:node /mnt/storage
# Repeat the non-root write check above before continuing.
docker compose --file docker-compose-prod.yml --env-file .env-prod up -d app background scheduler
```

This maintenance command changes ownership only within the generated storage mount; source albums stay mounted read-only. The normal application and scheduler entrypoints continue to run as `node`.

Scheduler checks can run through Docker without starting a database:

```sh
docker compose --file docker-compose-prod.yml --env-file .env-prod run --rm --no-deps -v "$PWD:/workspace:ro" app node --experimental-vm-modules /workspace/docker/test/scheduler.test.mjs
```
