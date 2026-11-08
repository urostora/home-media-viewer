# Home Media Viewer application package

This directory contains the Next.js Pages Router application: React, strict
TypeScript, Prisma 7.10.1 and MariaDB access. Compose files, Dockerfiles, scripts
and media fixtures live in the parent repository directory.

Start with the [repository setup guide](../README.md). Run development,
dependency, Prisma, build and test commands through Docker **from the repository
root**, rather than installing Node/npm dependencies on the host.

## Source layout

| Path | Contents |
| --- | --- |
| `src/pages/` | Pages Router UI and API routes |
| `src/components/` | React components |
| `src/utils/` | Authentication, database, media and processing helpers |
| `src/types/` | Shared TypeScript contracts |
| `src/backgroundProcesses/` | Background CLI entry point |
| `prisma/schema.prisma` | Database models and client generator |
| `prisma/migrations/` | Versioned SQL migrations |
| `prisma/seed.ts` | Explicit administrator bootstrap |
| `prisma.config.ts` | Prisma CLI URL, schema, migration and seed configuration |
| `__tests__/` | Component, utility, API and browser tests |

The `@/` import alias resolves to `src/`. The application uses Webpack for both
`next dev` and `next build`; production uses standalone output.

## Commands

After completing repository bootstrap, run these from the repository root:

```sh
docker compose up -d app
docker compose exec app npm run lint
docker compose exec app npm run typecheck
```

The development template publishes the app at [localhost:23080](http://localhost:23080);
use the configured `WEB_PORT` if changed. Port 3000 is the internal container port.

See [development dependency/schema updates](../README.md#subsequent-starts-and-updates)
for client generation and migration commands. Prisma 7 uses the MariaDB driver
adapter and explicit seed; see [Prisma configuration](../docs/prisma-upgrade.md).

## Validation and deployment

Use the [isolated build/test workflow](../scripts/build/README.md) for committed
revisions. It prepares the database, administrator and media fixtures before
running Jest with Chromium and guarded fixture login-budget isolation. For
working-tree/focused checks, see the [test instructions](../README.md#tests).

Production deployment uses the repository's app/migration images and persistent
MariaDB/generated-storage volumes. Follow the [release and recovery
instructions](../docs/database-lifecycle.md); the generated Next.js starter
hosting instructions do not describe this application's deployment.
