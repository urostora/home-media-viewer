# Database lifecycle and release recovery

Run from a release checkout with Docker Compose v2.20+ (validation: v5.6.0). MariaDB server upgrades and Prisma application migrations are separate maintenance operations. Normal Compose startup never sets MARIADB_AUTO_UPGRADE. The maintenance override opts into system-table upgrades only for an approved server update; setting this variable to `0` can still enable it, so omit it entirely during normal operation. The image's automatic system-table backup is not a complete application backup. See the [official image behavior](https://github.com/docker-library/docs/blob/master/mariadb/content.md).

## Persistent identity

Select the existing project explicitly with `-p` for every deployment, backup, recovery and monitoring command. The examples use `media`; replace it with the existing deployment's project, never adopt it blindly. Compose normally derives the project from the checkout directory (or COMPOSE_PROJECT_NAME / `name`); moving or renaming a checkout can create new empty volumes and look like data loss. Project selection must survive host replacement and automation changes. Do not use volume-deleting teardown in production. `stop` preserves containers and mounts; ordinary `down` preserves named volumes.

Record this inventory privately before changing a deployment, using its current Compose definition:

```sh
docker compose -f docker-compose-prod.yml --env-file /secure/hmv.env -p media ps -a
docker volume ls --filter label=com.docker.compose.project=media -q
docker compose -f docker-compose-prod.yml --env-file /secure/hmv.env -p media ps -a -q db app | xargs -r docker inspect --format '{{.Name}} project={{index .Config.Labels "com.docker.compose.project"}} image={{.Image}} mounts={{json .Mounts}}'
```

Protect mount output: it contains source paths. Save image digests, release manifest, container paths, actual volume names, media location and protected configuration alongside the backup manifest. Default mappings are:

| Compose definition | DB volume key | Generated-storage key | Default actual name |
| --- | --- | --- | --- |
| production | home-media-db-storage | home-media-storage | PROJECT_KEY |
| development | home-media-dev-db | home-media-dev-storage | PROJECT_KEY |
| test | home-media-test-db-storage | home-media-test-storage | PROJECT_KEY |

For example `media_home-media-db-storage` maps to `/var/lib/mysql`, and `media_home-media-storage` maps to APP_STORAGE_PATH (default `/mnt/storage`). APP_ALBUM_ROOT_PATH is a read-only source bind, not either named volume. Confirm actual names from inspection; explicit overrides may differ. During recovery map logical volume keys to new empty destinations; the [restore tool](../scripts/backup/README.md) uses inspected mounts and recorded container paths, not guessed names. To deliberately adopt existing volumes under a different project, use a reviewed override declaring each volume `external: true` with its exact `name`; verify both mappings before creating any service. Never attach the same database volume to two servers.

Fixed container names were removed so projects can coexist. Use service DNS `db`, `app`, `background` inside Compose and `compose exec SERVICE` for commands. Before recreating an older installation, replace legacy container-name hosts in private DATABASE_URL, MIGRATION_DATABASE_URL and SHADOW_DATABASE_URL with `db`; preserve usernames, passwords, database and query settings. This changes addressing, not account credentials. Use the [existing-volume identity/grant and ALTER USER procedure](production-security.md) for credential rotation; initialization environment variables do not rotate existing accounts.

Development `dependencies` is opt-in via `tools`, and `testrunner` via `test`. Explicit `compose run --rm dependencies ...` or `run --rm testrunner ...` still works without enabling a profile. Ordinary development startup includes DB, the finite migration dependency and app; scheduler remains opt-in via `scheduled`. Migration stays in the dependency graph because app must not start before it succeeds. Test Compose retains its dedicated test workflow. Dockerfiles no longer create implicit anonymous volumes; Compose owns all persistent mounts.

## Application update and rollback

1. Inventory the deployment as above. Retain the previous release checkout, manifest, image IDs and protected environment. Build/validate the candidate with the [release pipeline](../scripts/build/README.md); pin both app and migration references from one manifest. Keep the DB image unchanged for an application-only release.
2. Freeze external imports/schema changes, stop scheduler/app/background and create a verified complete set with the [backup runbook](../scripts/backup/README.md). Restore that set into an isolated project at the previous revision/server image and confirm login, counts, migration history, media and thumbnails. Keep a verified off-host generation. Measure the real data size against the agreed downtime/recovery window.
3. With consumers still stopped, select the candidate release checkout and both manifest image references. Run the finite migration job; proceed only on exit zero:

   ```sh
   docker compose -f docker-compose-prod.yml --env-file /secure/hmv.env -p media run --rm --pull never migration
   docker compose -f docker-compose-prod.yml --env-file /secure/hmv.env -p media up -d --no-deps --no-build --pull never app
   ```

   `--no-deps` here avoids rerunning migration/startup dependencies after the explicit successful job. Verify DB health first. Keep background and scheduler stopped until web readiness, administrator login, album/media/thumbnail access and migration history pass. Then start background with the same flags, check readiness and one indexing batch, and start scheduler. Monitor operational checks before accepting the release.
4. If migration fails, leave consumers stopped, preserve logs and inspect migration history. Follow Prisma's failed-migration recovery; never reset the deployment. If the old application is demonstrably compatible with the resulting schema, restore both old manifest references and start it from its original checkout. Otherwise restore the pre-update complete set into new empty volumes at the old revision/server version and validate before routing traffic. Do not guess reverse SQL or rerun seed to repair an upgrade. Writes since the backup require explicit reconciliation before recovery; record the recovery point.

## MariaDB server update

The repository currently pins MariaDB 13.0.2-resolute by digest. This task does not select a new server release or certify an unspecified historical source version. Verify the deployed version (`SELECT VERSION()`), actual image digest and source/target release notes before choosing a candidate. Review the [standalone upgrade policy](https://mariadb.com/docs/server/server-management/install-and-upgrade-mariadb/upgrading/mariadb-community-server-upgrade-paths/general-upgrade-information), all intervening incompatible changes and the target release's specific instructions. Record the supported path and prerequisites in the maintenance ticket. Unsupported/uncertain paths require a staged or logical-migration plan and another rehearsal.

1. Complete the backup/restore drill above at the original version. Keep app artifacts and Prisma schema unchanged while rehearsing the server change. On the restored isolated project, stop every writer, set `innodb_fast_shutdown=0` as a privileged DB maintenance connection, then cleanly stop DB. Save a verified recovery point before exposing that restored datadir to the candidate. Keep the original production volumes untouched throughout rehearsal.
2. In the candidate release checkout, deliberately update the pinned DB image tag/digest. Pre-pull it. Combine the production definition with the maintenance override and start **only db**:

   ```sh
   docker compose -f docker-compose-prod.yml -f docker-compose-db-upgrade.yml --env-file /secure/hmv.env -p media up -d --no-deps --no-build --pull never db
   ```

   Use the isolated project's settings/name during rehearsal. Inspect exit status, logs, health and `SELECT VERSION()`. The override disables automatic restart so a failed upgrade does not loop. Confirm system-table upgrade completion, run the target version's recommended table checks (normally `mariadb-check --all-databases --check-upgrade` with a protected privileged client connection), inspect grants, row counts and Prisma migration history. Run readiness/login/media/indexing and stop/restart checks with the unchanged application release. Measure the outage and rollback restore time.
3. Rehearse rollback by restoring the pre-upgrade complete set into fresh empty volumes on the **original** server image, then verify the unchanged application. Do not start an older server against a datadir opened/upgraded by a newer server: cross-major downgrade is unsupported; use the [pre-upgrade backup recovery path](https://mariadb.com/docs/server/server-management/install-and-upgrade-mariadb/downgrading-between-major-versions-of-mariadb).
4. Only after the candidate path and rollback pass, repeat the same procedure during the deployment maintenance window with a new consistent backup. Keep writers stopped until acceptance. Recreate db using **only the normal production definition**, preserving project/volumes and candidate pin, to remove MARIADB_AUTO_UPGRADE and restore its restart policy. Recheck health/version. Start and verify web, background, then scheduler as above. Do not combine a server update, application schema update and account rotation in one unverified step.

Record source/target digests, release revision, backup ID and remote verification, row/hash checks, grants, upgrade/check logs, measured downtime/recovery and acceptance. Actual deployed credential rotation, off-host storage and candidate-specific rehearsals require the deployment's configuration; fixture validation does not establish those results.

## Validation

Run `python3 docker/test/setup-lifecycle.test.py` from the repository root with Docker access. This host-side infrastructure orchestrator generates private settings and two random projects, checks all three Compose configurations and maintenance opt-in, restores a complete small synthetic backup, checks row/file preservation and restarts the restored server. It uses the current pinned server, not a candidate upgrade, and removes its task-only resources. Application/dependency commands remain inside Docker. The application suite and candidate-specific server rehearsal are separate checks.
