# Prisma 7 upgrade

The application and migration image pin `prisma`, `@prisma/client` and
`@prisma/adapter-mariadb` to 7.10.1. Prisma 8 is a prerelease at the time of this
upgrade. Use the pinned local CLI (`npx --no-install prisma`); an unqualified
package installation using `latest` can select a different major.

## Configuration and development

Run commands from the repository root through Docker. Stop consumers of the
development dependency tree before refreshing it, and stop any one-off CLI/test
consumers too. The final migration command waits for the configured database and
applies pending migrations without seeding:

```sh
set -e
docker compose stop app scheduler
docker compose run --rm --no-deps dependencies npm ci
docker compose run --rm --no-deps dependencies npx --no-install prisma generate
docker compose run --rm --no-deps dependencies npx --no-install prisma validate
docker compose run --rm --no-deps dependencies npm run typecheck
docker compose run --rm migration
docker compose up -d app
```

`home-media-viewer/prisma.config.ts` configures the schema, SQL migration history,
CLI database URL, optional shadow URL, and explicit seed command. Compose supplies
environment variables; config does not automatically load an environment file.
Image generation requires no URL or live database. Next's image build uses a
synthetic URL only to construct lazy clients while collecting routes.

Production migration receives `MIGRATION_DATABASE_URL` as its `DATABASE_URL`;
web/background receive the separate runtime URL. The migration image has its own
manifest and lockfile. Keep both dependency trees aligned on future upgrades.

The supported `prisma-client-js` generator remains in use with `engineType =
"client"`. It preserves the existing server, browser enum, and CommonJS imports.
The MariaDB adapter replaces the Rust query engine. A switch to the optional
`prisma-client` generator is a separate change requiring loader/import and image
tracing validation. Explicit client generation and explicit first-install
administrator seeding remain required; normal migration never seeds accounts.

## Connections and retries

`src/utils/prisma/clientFactory.ts` creates the adapter and pool for each process;
`prismaImporter.ts` shares its client within that process. Seed owns and disconnects
a separate client. Disconnect releases the adapter-owned pool.

The runtime accepts a `mysql://` URL and decodes username, password and database.
`DB_CONNECTION_LIMIT` defaults to 5 and must be an integer from 1 to 20. As before,
it overrides `connection_limit` in the URL. Production Compose forwards this
variable; development/test services use the default unless you explicitly add it
to their container environment. Acquisition and connect limits are
5 seconds; socket inactivity and query limits are 10 seconds; idle connections
expire after 300 seconds. Driver timeout options use milliseconds except for
idle expiry, which uses seconds. Interactive transaction limits remain Prisma's
defaults. These are separate from driver timeouts.

Supported additional URL parameters are `socket`, `sslcert` (CA), `sslidentity`
(PKCS#12 identity), `sslpassword`, and `sslaccept` (`strict` or
`accept_invalid_certs`). Certificate paths resolve relative to `prisma/`, or can
be absolute mounted paths. TLS verification is enabled unless explicitly disabled.
The legacy `pool_timeout`, `connect_timeout` and `socket_timeout` parameters remain
accepted, with the application limits taking precedence as before. Unknown or
duplicate parameters fail startup instead of being silently discarded. Errors
from URL parsing and certificate loading do not expose credentials or paths.

Prisma middleware has been removed. Standalone model reads explicitly call
`retryRead(() => prisma.model.findFirst(...))`, creating a fresh query per attempt.
P1001/P1002/P1017 and the adapter’s known connection/pool timeout codes wrapped
in P2039 are retried, at most twice with 250/500 ms delays. Authentication, SQL,
deadlock and closed-pool errors are excluded. Never wrap a write, raw query or
transaction in this helper. The existing whole-transaction metadata retry also
recognizes confirmed MariaDB deadlocks in Prisma 7 adapter metadata; lock waits
and ambiguous failures remain excluded. Array transactions retain their
original PrismaPromises; interactive transaction reads use the transaction client
directly. Test instrumentation uses query extensions installed before loading
application modules; it does not change production retry behavior.

## Release and recovery

This upgrade changes configuration and dependencies without adding SQL migrations
or changing model definitions. Validate the existing history against both a fresh
database and an existing installation before rollout. Never rewrite applied SQL,
reset deployed databases, or use `db push` as a migration shortcut.

Use the [build pipeline](../scripts/build/README.md) to build a committed candidate
and retain both old and new release manifests. Follow the [database lifecycle
runbook](database-lifecycle.md) and [backup/restore procedure](../scripts/backup/README.md):
stop all writers, create a backup and verify its isolated restore, apply the
candidate migration image,
then start web, verify readiness/login/albums/file delivery, and only then start
background/scheduler. Check indexing progress and total process connection budgets.

For rollback, stop new writers and select both previous manifest image references.
The migration regression checks verify that the v5 client can still read the
unchanged schema and preserved relationships after v7 writes. Confirm this against
the actual release/data before production rollback, and retain the current session
revocation/authorization model; ORM compatibility alone does not make an older
authentication implementation safe. Restore a database backup only
if required by a separately reviewed schema/data change, accounting for newer
writes. Do not delete shared volumes.

## Validation entry points

The normal [isolated build/test workflow](../scripts/build/README.md) covers packaged
migration, explicit seed, web/background startup, fixture initialization and Jest.
The [stage runner](background-processing.md) additionally exercises discovery,
media queues, transactional publication and query plans.

Repeated benchmarks reset login budgets only in the guarded fixture database
between scenarios. SQL counts exclude transaction-control statements and the
adapter's synthetic commit/rollback comments, giving both engines the same
measurement rules.

`docker/test/database-lifecycle.test.mjs` checks seed/retry/configuration behavior.
`docker/test/prisma-upgrade.cjs` requires a guarded disposable database. Its
`--seed-legacy` and `--check-legacy` modes run with an old client; default mode checks
data types, error codes, transaction failures and retries with the new adapter.
Use isolated credentials and volumes as described in the repository testing guide.

Upstream references: [v7 upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7),
[MariaDB adapter](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/mysql),
[driver pool settings](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool).
