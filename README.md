# Home Media Viewer

[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)[![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/en)[![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)](https://react.dev/)[![MariaDB](https://img.shields.io/badge/MariaDB-003545?style=for-the-badge&logo=mariadb&logoColor=white)](https://mariadb.org/)[![Next JS](https://img.shields.io/badge/Next-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)](https://www.prisma.io/)[![Jest](https://img.shields.io/badge/-jest-%23C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io/)

A Docker-based application for browsing photos and videos, generating thumbnails, and extracting searchable metadata. The application uses Next.js Pages Router, React, strict TypeScript, Prisma 7.10.1 and MariaDB.

Media files can be filtered by extracted metadata like date or location.

![Album list](https://hmv.devati.net/docs/content-list.jpg)

![Search by ](https://hmv.devati.net/docs/search-by-location.jpg)

## Requirements and layout

Use Docker Engine with Docker Compose **2.24.4 or newer**. Python 3.9+ and Git are required by the environment generator and committed build/test scripts. Node, npm, Prisma, FFmpeg and browser tooling run in containers. Container validation currently covers Linux amd64.

Run the commands below from the **repository root**. The application package is in `home-media-viewer/`; Compose definitions, Dockerfiles, scripts and `test/files/` fixtures are at the root. Pinned Node/MariaDB images are configured in [docker/base-images.yml](docker/base-images.yml).

| Role | Development Compose | Production/test Compose |
| --- | --- | --- |
| Database | `db` | `db` |
| Schema deployment | `migration` | `migration` |
| Web/API | `app` | `app` |
| Background HTTP processing | `app` when `IS_BACKGROUND_PROCESS_ENABLED=1` | `background`, using the same image as `app` |
| Scheduled indexing | Opt-in `scheduler` | Production `scheduler`; opt-in for tests |
| Dependency/tool commands | `dependencies` | Separate migration/browser images |
| Jest/browser tests | `testrunner` | `testrunner` |

## Media and persistent storage

The supplied Compose files mount `./test/files` as read-only source media. Albums are folders under `APP_ALBUM_ROOT_PATH` (default `/mnt/albums`). For your own library, replace that bind mount's **host source** with your media directory; in production/test Compose apply the same source mount to both `app` and `background`:

```yaml
- /srv/media:${APP_ALBUM_ROOT_PATH}:ro
```

`APP_STORAGE_PATH` is the generated-storage root (default `/mnt/storage`); `APP_THUMBNAIL_SUBDIRECTORY` defaults to `thumbnail` beneath it. Keep this writable storage separate from source media and the MariaDB datadir.

| Compose file | Database volume key | Generated-storage volume key |
| --- | --- | --- |
| `docker-compose.yml` | `home-media-dev-db` | `home-media-dev-storage` |
| `docker-compose-test.yml` | `home-media-test-db-storage` | `home-media-test-storage` |
| `docker-compose-prod.yml` | `home-media-db-storage` | `home-media-storage` |

Actual volume names include the Compose project name. Preserve the existing project/volume mapping when updating an installation; see [database lifecycle and recovery](docs/database-lifecycle.md).

## Development

### First installation

Create a new private environment file; the generator refuses to overwrite an existing one:

```sh
python3 scripts/security/create-env.py .env.example .env
```

Review `.env` before starting: set `ADMIN_EMAIL`, retain the generated private passwords/token/session secret, and choose source paths and host ports. The template publishes the web app on port **23080** and the database on loopback port **23306**. `SESSION_COOKIE_SECURE=false` is the explicit development HTTP setting. For existing environments, preserve working credentials and follow the [credential transition guide](docs/production-security.md).

Install dependencies, generate the Prisma client, deploy the schema, and explicitly bootstrap the administrator before starting the app:

```sh
set -e
docker compose run --rm --no-deps dependencies npm ci
docker compose run --rm --no-deps dependencies npx --no-install prisma generate
docker compose up -d --wait db
docker compose run --rm --no-deps migration
docker compose run --rm --no-deps dependencies npx --no-install prisma db seed
docker compose up -d --no-deps app
```

Open [http://localhost:23080](http://localhost:23080), or your configured `WEB_PORT`, and log in with the configured administrator credentials. Add folders as albums from Browse; use the [background processing guide](docs/background-processing.md) for indexing and refresh options.

Schema deployment uses `prisma migrate deploy` and preserves existing data. Prisma 7 does **not** automatically seed or generate the client during migration. Seed creates the configured administrator if absent, preserves an existing active administrator/password, and refuses to promote or reactivate an existing account.

### Subsequent starts and updates

For an initialized development environment:

```sh
docker compose up -d app
```

The dependency graph waits for the database and successful schema deployment. After changing dependencies or the Prisma schema, stop consumers of the shared dependency tree before refreshing it:

```sh
set -e
docker compose stop app scheduler
docker compose run --rm --no-deps dependencies npm ci
docker compose run --rm --no-deps dependencies npx --no-install prisma generate
docker compose run --rm --no-deps dependencies npx --no-install prisma validate
docker compose run --rm --no-deps migration
docker compose up -d app
```

Also stop any one-off CLI/test processes using that dependency tree. See [Prisma upgrade/configuration notes](docs/prisma-upgrade.md). There is no separate development `background` service. Enable the optional scheduler when you want periodic indexing; its target app must have `IS_BACKGROUND_PROCESS_ENABLED=1`:

```sh
docker compose --profile scheduled up -d app scheduler
```

### Development commands

Use the running app for ordinary checks, or the dependency service before it is started:

```sh
docker compose exec app npm run lint
docker compose exec app npm run typecheck
docker compose run --rm --no-deps dependencies node --version
```

To create a deliberate schema migration on the development/shadow databases:

```sh
docker compose run --rm --no-deps dependencies npx --no-install prisma migrate dev --name describe-change
docker compose run --rm --no-deps dependencies npx --no-install prisma generate
```

Keep generated SQL migrations in version control. Do not reset a shared database or delete generated media to apply an update. Avoid running a production `npm run build` against the `.next` directory of a running development server; use the [isolated build workflow](scripts/build/README.md).

## Tests

For full integration testing of a **committed** revision, use the disposable runner:

```sh
bash scripts/build/test/build-test.sh --ref HEAD
```

It builds app/migration/Chromium images, creates private credentials and fresh database/storage volumes, waits for MariaDB, applies migrations, explicitly seeds the administrator, starts app/background, initializes fixtures, and runs Jest serially. It isolates image tags and ports, stops on setup failures, and removes its temporary resources. It tests committed content only; see the [build/test guide](scripts/build/README.md) and [working-tree validation guidance](.agents/testing.md) for other cases.

The runner opts into guarded test-only login-budget isolation between API/browser suites. Manual disposable setups must explicitly pass `HMV_RESET_TEST_LOGIN_BUDGETS=true` and `HMV_TEST_DATABASE` matching their fixture database for equivalent behavior. Never enable this against shared/production data.

For a focused component test after installing development dependencies and generating the client:

```sh
docker compose build testrunner
docker compose run --rm --no-deps testrunner npx --no-install jest --runInBand --runTestsByPath __tests__/components/albumDetails.test.tsx
```

Even focused Jest runs use the Chromium preset. API/browser tests additionally need a prepared application/database/media fixture; `--no-deps` does not prepare them.

For **one-time fixture initialization in a fresh disposable development test installation** using the default media mount, after schema deployment and administrator bootstrap:

```sh
docker compose run --rm testrunner bash /home/node/scripts/initTestData.sh
```

This creates `album01`/`album02` albums and a synthetic guest, then processes their media. It is not an idempotent reset or a setup step for a personal library. In the packaged test image the corresponding command is `bash ./scripts/initTestData.sh`. Changing only an environment database name does not reinitialize an existing MariaDB volume. Use a new isolated project for fresh data.

## Production

Use the [release build/test guide](scripts/build/README.md), [security guide](docs/production-security.md), and [database update/rollback runbook](docs/database-lifecycle.md). All production commands must select the **existing** Compose project explicitly. The examples below use `media`; replace it with your installation's project name.

Create settings for a new installation with:

```sh
python3 scripts/security/create-env.py .env-prod.example .env-prod
```

Set `ADMIN_EMAIL`, review paths/ports and configure the HTTPS reverse proxy before use. Production defaults to secure cookies, a loopback web listener on port 25080, no published DB port, and separate runtime/migration database identities. Existing-volume credentials/grants require the explicit transition in the security guide.

Build a committed release and retain its manifest:

```sh
bash scripts/build/production/build-prod.sh --ref HEAD --manifest /protected/releases/hmv-release.json
```

Set `HMV_APP_IMAGE` and `HMV_MIGRATION_IMAGE` together from that manifest in the private deployment settings. Web/background/scheduler share the app image; schema deployment and explicit seed use the migration image. The build script does not publish or deploy a release.

For a **first installation** with those release images already available, pull the pinned database image before starting it:

```sh
set -e
docker compose -p media -f docker-compose-prod.yml --env-file .env-prod pull db
docker compose -p media -f docker-compose-prod.yml --env-file .env-prod up -d --no-build --pull never --wait db
docker compose -p media -f docker-compose-prod.yml --env-file .env-prod run --rm --no-deps --pull never migration
docker compose -p media -f docker-compose-prod.yml --env-file .env-prod run --rm --no-deps --pull never migration npx --no-install prisma db seed
docker compose -p media -f docker-compose-prod.yml --env-file .env-prod up -d --no-deps --no-build --pull never app
```

Verify readiness and administrator login, then start background processing and its scheduler:

```sh
docker compose -p media -f docker-compose-prod.yml --env-file .env-prod up -d --no-deps --no-build --pull never background scheduler
```

For an **existing installation**, follow the update runbook: stop all writers, create a verified backup and test an isolated restore, select both candidate image references, deploy migrations, and restart consumers only after successful migration. Preserve the existing administrator; migration does not seed accounts. Keep the previous release manifest/images for rollback and keep MariaDB server upgrades separate.

The shared Prisma/MariaDB adapter uses a per-process pool of 5 by default (`DB_CONNECTION_LIMIT`, 1–20), 5-second acquisition/connect limits and 10-second socket/query limits. Supported URL/TLS options and retry behavior are described in [Prisma configuration](docs/prisma-upgrade.md). Standalone model reads receive at most two retries for recognized connection failures with 250/500 ms delays. Writes/raw queries/transaction reads are not replayed by that helper; metadata publication separately retries only confirmed rolled-back transaction conflicts.

### Scheduling, storage permissions and recovery

Production runs web/background/scheduler as UID/GID 1000. One scheduler calls `http://background:3000` serially using the process token. It waits 180 seconds after drained work, uses a 30-second catch-up delay for deadline-limited backlog, and backs failures off up to 900 seconds by default. See [operations](docs/operations.md) for health, resource limits, shutdown, persistent-lock recovery and configuration.

A fresh generated-storage volume inherits ownership from the image at `/mnt/storage`; existing volumes retain their permissions. For the default `/mnt/storage/thumbnail` layout, verify writes as the image's normal user:

```sh
docker compose -p media -f docker-compose-prod.yml --env-file .env-prod run --rm --no-deps --pull never app node -e 'const fs = require("node:fs"); fs.mkdirSync("/mnt/storage/thumbnail", { recursive: true }); const probe = "/mnt/storage/thumbnail/.write-check-" + Date.now(); fs.writeFileSync(probe, "ok", { flag: "wx" }); fs.unlinkSync(probe); console.log("Storage writable by UID", process.getuid());'
```

If ownership is incompatible, confirm the selected project and generated-storage mount, stop every writer, and repair **only that generated volume**. Replace `/mnt/storage` with the actual mounted `APP_STORAGE_PATH` when using a custom location:

```sh
docker compose -p media -f docker-compose-prod.yml --env-file .env-prod stop scheduler app background
docker compose -p media -f docker-compose-prod.yml --env-file .env-prod run --rm --no-deps --pull never --user root app chown -R node:node /mnt/storage
```

Repeat the non-root write check before restarting with the pinned image references and `--no-build --pull never`. Source media stays read-only; do not change database/source ownership or remove shared volumes as part of this repair.

Back up the database and entire generated-storage volume using the [backup and isolated restore runbook](scripts/backup/README.md). Original media and private configuration/secrets need separate backups.

## Reference guides

- [Application package and source layout](home-media-viewer/README.md)
- [Container builds and dependency updates](docs/container-builds.md)
- [Prisma 7 upgrade and connection configuration](docs/prisma-upgrade.md)
- [Background stages and CLI/API options](docs/background-processing.md)
- [Operations and monitoring](docs/operations.md)
- [Production security](docs/production-security.md)
- [Database lifecycle and rollback](docs/database-lifecycle.md)
- [Release builds and disposable integration tests](scripts/build/README.md)
- [Media/stage benchmarks](scripts/benchmark/README.md)

Code uses four spaces for indentation (`.editorconfig` and `home-media-viewer/.prettierrc`).
Format current application and repository JavaScript, TypeScript, styles, JSON, YAML and Bash scripts with
`bash scripts/format.sh --write`, or verify with `bash scripts/format.sh --check`.
These commands run Prettier and the pinned shfmt Bash formatter through Docker and leave lockfiles, generated files,
media fixtures and historical release records untouched. For application code only,
run `docker compose exec app npm run prettier-format` or `docker compose exec app npm run format:check`.
