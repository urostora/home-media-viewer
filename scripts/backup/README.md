# Backup and recovery

Run from the repository root with Python 3.9+ on Linux and Docker Compose v2. These scripts operate through the selected Compose project/service containers, never fixed container or volume names. Use the same destination for all runs of a project: an exclusive filesystem lock prevents overlap. The destination must be on a reliable local filesystem supporting flock and atomic rename, outside the source media tree. Use a dedicated account and private destination (0700); database dumps contain password hashes and media archives contain personal data. Do not commit backups.

## Create a consistent set

Stop all writers, including external source-media imports and schema changes. Keep MariaDB running. The script refuses running app/background/scheduler containers; it does not stop services itself. Existing stopped app containers are required to identify actual mounts. Source media must be a direct mount at APP_ALBUM_ROOT_PATH and generated storage a direct mount at APP_STORAGE_PATH (/mnt/storage by default). Other storage layouts fail explicitly. Symlinks, hard links, special files and nested mounts are rejected rather than silently producing an incomplete portable recovery archive. Remote FTP albums need a separate provider backup.

```sh
docker compose -f docker-compose-prod.yml --env-file /secure/hmv.env -p media stop scheduler app background
python3 scripts/backup/backup.py --compose-file docker-compose-prod.yml --env-file /secure/hmv.env --project media --destination /srv/backups/hmv --keep 7
docker compose -f docker-compose-prod.yml --env-file /secure/hmv.env -p media up -d app background scheduler
```

Restart consumers after investigating any backup failure. Scheduling must monitor the exit code and backup age. Do not blindly restart during a restore. `db_backup.sh` and `file_backup.sh` accept the same required options but create DB-only and files-only sets; prefer one default `all` set to keep database IDs, thumbnails and media consistent.

Each successful set is a private `hmv-PROJECT-SCOPE-TIMESTAMP/` directory containing `database.sql`, real gzip tar archives `storage.tar.gz` and `media.tar.gz`, and a manifest with SHA-256 checksums, container mount paths, actual volume/bind sources, and image identity. SQL is streamed using the running server's own `mariadb-dump` client. Credentials remain inside db; no resolved Compose secrets are recorded. Database grants/system accounts are deliberately excluded; Compose initialization recreates the deployment identity. User accounts/password hashes, albums, file metadata and migration history are included.

The script checks subprocess exit codes, reads the full compressed archives including gzip checksums, hashes each payload and flushes it before an atomic directory rename. An interrupted/failed run leaves a private `.incomplete-*` directory for diagnosis, never a published set. Remove incomplete directories only after investigating. Retention runs only after successful verification/publication and only for the exact selected project/scope timestamp pattern. It never counts incomplete sets or unrelated files. Old candidates must also verify before deletion. Keep at least one set; retention does not establish an off-host copy. SHA-256 detects accidental corruption, not malicious modification of both manifest and payload.

## Restore to an isolated project first

Use the recorded application revision and MariaDB server version/image first. Logical dumps need no physical prepare step; the server must be running for import. A matching MariaDB client avoids dump sandbox/version incompatibilities. See [MariaDB logical backup documentation](https://mariadb.com/docs/server/clients-and-utilities/backup-restore-and-import-clients/mariadb-dump).

1. Copy the complete verified set from protected off-host storage to a private local destination. Recover deployment configuration and secret material separately.
2. Create an isolated Compose definition/project with **no fixed container names, no published database port, new empty database/generated-storage volumes and a new empty media directory**. Use service DNS `db` in DATABASE_URL. Reuse recorded container paths (/mnt/albums and /mnt/storage by default); use a different host media directory. Never point a recovery drill at production media, volumes or database. Do not run migrations or seed before import. Ensure the selected image is locally available.
3. Start only db and wait for health. Create (do not start) app using `docker compose ... up --no-start --no-deps app`. Its mount declarations identify the restore destinations. No migration/consumer may be running. A fresh storage volume must contain no files; the script refuses populated target directories or a database with tables. Use a fresh project after any partial restore failure; do not erase an existing database to retry.
4. Restore using the isolated definition and project:

   ```sh
   python3 scripts/backup/backup.py --compose-file /secure/recovery-compose.yml --env-file /secure/recovery.env --project media-recovery --destination /srv/backups/hmv --restore /srv/backups/hmv/hmv-media-all-TIMESTAMP
   ```

   Restore validates all checksums and destinations before import, then restores numeric ownership and permissions from tar. A short-lived root helper uses the exact selected app image, no network, and only the selected mount. Source media stays read-only in the application; the recovery helper writes into the explicitly selected empty recovery mount. Source bind directories must already exist; volume sources come from an existing inspected container, avoiding accidental empty-volume backup creation.
5. Confirm generated storage is writable by the runtime UID (normally 1000); use the README write probe and targeted ownership repair if UID mapping changed. Compare source-media and thumbnail hashes to the backup. Database Album.basePath and File.path are reconciled by preserving the container mount paths and the original directory hierarchy. Do not update IDs or silently rewrite paths. Any custom/FTP connectionString must be reconciled separately before enabling processing.
6. Deploy migrations only for a deliberate application upgrade after recovery at the original revision has passed. Start web without scheduling, verify administrator login, album listing, a representative photo/video download and thumbnail access. Check row counts and migration history. Start background and scheduling only after these checks. Record backup ID, row counts, bytes, durations and results; retain the previous working deployment until acceptance.

Never restore these logical SQL files as raw files under /var/lib/mysql. For legacy **physical** archives, use a mariadb-backup tool compatible with the original server version (prefer the same exact release), run `mariadb-backup --prepare --target-dir=...` on a separate extracted copy, stop MariaDB, use an empty datadir, run `--copy-back`, restore datadir ownership to the image's mysql UID/GID, then start the original server version and verify it before considering upgrades. Never copy live physical files over a running server. The replaced legacy script did not establish preparation or integrity; do not assume its archives are recoverable. See [MariaDB physical recovery](https://mariadb.com/docs/server/server-usage/backup-and-restore/mariadb-backup/full-backup-and-restore-with-mariadb-backup).

## Recovery policy and operational checklist

| Data | Policy |
| --- | --- |
| Source photos/videos | Irreplaceable; include media archive or separately versioned, verified source backup. Freeze imports during a set. Include external/FTP sources separately. |
| DB records/users | Daily consistent logical dump with the matching media snapshot; preserve album/file IDs, user hashes, metadata and migrations. |
| Generated thumbnails | Include for prompt recovery; otherwise regenerate only after reconciling original paths and IDs. |
| Compose/configuration | Keep application revision/image digests and a protected copy of deployment configuration outside this repository. |
| Secrets | Encrypt separately in a managed vault/off-host backup; preserve the session secret if sessions must survive, otherwise expect re-login. Recreate DB grants from protected deployment settings. |

Suggested initial objectives: recovery point <=24 hours and recovery time <=4 hours, subject to the deployment owner's agreement and a timed drill on the **actual deployment size**. Measure dump/import time, media bytes, transfer duration and temporary free-space needs before adopting these targets. Logical backups trade simple recovery for longer imports at scale. The fixture drill does not validate real deployment capacity. Use a prepared physical backup strategy if measured logical recovery exceeds the agreed window.

After each successful set, copy it to an encrypted, access-controlled off-host store (for example an existing restic repository), verify remote checksums and restore a sample. Keep remote retention independent of local pruning and protect at least one known-good generation with immutability or offline storage. Configure the deployment's destination, credentials and retention outside Git. No off-host account or deployed backup schedule is configured by these scripts. Alert on failed jobs, overdue backups, low staging/destination space and failed remote verification. Rehearse recovery monthly and before every server upgrade; record actual RPO/RTO. Do not prune the last off-host verified generation until another set has passed a recovery drill.

## Regression checks

Run the focused failure/retention checks inside Docker without starting the development database:

```sh
docker compose run --rm --no-deps -v "$PWD:/workspace:ro" dependencies python3 /workspace/docker/test/backup.test.py
```

The isolated fixture recovery drill and its verification results are recorded in section 4 of [the infrastructure review](../../infrastructure-review.md).
