# Operating a single-host installation

Use Docker Engine with Compose >=2.24.4 on Linux. Run commands from the release checkout with the **same project name and private environment file** used for deployment. Keep image references tied to one release manifest; see [container builds](../scripts/build/README.md), [security](production-security.md) and [recovery](../scripts/backup/README.md). These settings are a starting budget for one web process, one background process and one scheduler on a host with at least 6 GiB RAM and four CPU cores. Reserve capacity for the host, proxy, filesystem cache and backups; measure your own video sizes and library before increasing load.

## Health, failure and recovery

`GET /api/health/live` returns 200 while the HTTP event loop responds, and 503 during shutdown. `GET /api/health/ready` checks all four application models, unfinished/failed migration history, source-root access, a create/write/delete probe under thumbnail storage and available generated-storage space. It never indexes or returns credentials, file paths or DB error details. Successful results are cached for five seconds; concurrent checks share one probe. Docker checks readiness every 30 seconds with a 60-second startup window and three retries. DB connections/queries have bounded timeouts. Low space below MIN_STORAGE_FREE_BYTES (256 MiB default) fails readiness. Monitor DB/datadir and backup/log filesystems separately.

Production db/app/background/scheduler restart with `unless-stopped`; migration remains a finite job with `restart: "no"`. Container logs use Docker's `local` driver with 10 MiB × 3 files per container. Recreate existing containers to apply these settings. An **unhealthy** running container remains running under ordinary Compose. No automatic health-driven restart is configured. The host probe below exits nonzero for alert delivery; have your existing monitoring agent run it every minute and page the deployment operator on failure. Also alert on container restarts/OOM events and collect Docker logs. Alert delivery credentials, remote agents and installation of host timers belong to the deployment environment.

On an alert, inspect `compose ps`, bounded `compose logs --tail 100`, `docker stats --no-stream`, host disk usage and the probe JSON. Check DB health/free space first; restore capacity or access and rerun readiness. For a stuck application, stop the scheduler, capture relevant logs and restart only the affected consumer. Start scheduling after readiness recovers. Repeated OOM/restarts require budget/workload changes, rather than restart loops. A failed migration requires investigation and explicit recovery; never repeatedly reset the database. Keep a copy of alert/recovery results with the deployment record.

## Limits and sizing

| Service | CPU quota | Memory limit | Relevant budget |
| --- | ---: | ---: | --- |
| DB | 1 | 1 GiB | 384 MiB InnoDB pool, 40 connections |
| Web | 1 | 1 GiB | Prisma pool of 5 connections |
| Background | 2 | 2 GiB | Prisma pool of 5; 2 media workers |
| Scheduler | 0.25 | 128 MiB | One serial HTTP request |

All are configurable in `.env-prod.example`. MEDIA_WORKERS is clamped to 1–4 and available CPU parallelism, including the one-CPU case. Each FFmpeg invocation uses one decode/encode/filter thread; FFprobe/FFmpeg run asynchronously, time out after 30 seconds per tool, and report failures. Images await completed thumbnail writes. Very large images can still consume substantial memory; retain an operational margin. Default Prisma pools consume at most 10 connections across web/background, leaving room under 40 for migrations, backup and administration. Account for every replica/process before changing this budget. Container CPU quotas may be fractional; Node's availableParallelism is not a substitute for the declared CPU quota.

Verify enforced Engine settings after deployment (use actual IDs from `compose ps -q SERVICE`):

```sh
docker inspect --format '{{.HostConfig.NanoCpus}} {{.HostConfig.Memory}} {{.HostConfig.RestartPolicy.Name}} {{json .HostConfig.LogConfig}} {{.Config.StopTimeout}}' CONTAINER_ID
docker stats --no-stream
```

NanoCpus is CPUs × 1,000,000,000; Memory is bytes. Confirm DB `@@innodb_buffer_pool_size` and `@@max_connections` in a protected SQL session. Sample container memory/CPU during representative photos and longest videos, HTTP latency during indexing, OOM/restart counters, DB connections and tool/request durations. Do not infer enforcement merely from successful `compose config`. Fixture acceptance is recorded in section 8 of the review; it is not a deployment-scale capacity claim.

## Scheduling, authentication and overlap

Production has one dedicated scheduler; web refuses indexing even with `force=1`. Development no longer starts root cron or dumps its environment. Development/test scheduling is opt-in with `--profile scheduled`; development also needs IS_BACKGROUND_PROCESS_ENABLED=1 on its app. The scheduler waits three minutes between requests, sends `Authorization: Bearer PROCESS_TOKEN`, times out at LONG_PROCESS_TIMEOUT_SEC + 60 seconds and logs failures to stderr. It cancels waiting/in-flight HTTP on SIGTERM. Cancellation of the HTTP client does not promise cancellation of server processing. Manual callers and fixture setup must use the same header. Query-string tokens are rejected. Keep `/api/process/` blocked at the public proxy as in the security runbook; only the web service has a published port. Keep the internal Docker network private.

An atomic `operations/indexing.lock` directory on the shared generated-storage volume prevents overlap across requests **and processes**, including multiple schedulers. Busy requests receive 409 and the scheduler reports the lock. All workers must share the same storage root on a local filesystem with atomic mkdir/rename; independent volumes do not coordinate. Do not introduce replicas on independent storage. A successful or failed run releases the lock in finally. Crash/SIGKILL leaves it locked deliberately. There is no automatic expiry that could start duplicate workers while an old one still runs.

For a persistent lock, stop scheduler **and every background/manual worker**, verify they are stopped, and inspect `operations/indexing.json` and logs. With writers stopped, remove only the empty lock directory using a one-shot maintenance container mounting the same generated volume (`rmdir APP_STORAGE_PATH/operations/indexing.lock`). Restart one background service, then the scheduler; verify a new success. Never delete the volume or remove a lock while a writer may still be alive.

Persistent `operations/indexing.json` records start/finish, outcome, cumulative failed-run count and last successful run; successful means no reported sync/metadata errors during that bounded batch, not that the whole library is complete. `/api/process/lastProcessStatistics` includes this as `indexing`, authenticated on the background role. `data` retains the existing in-memory statistics and may be absent after restart. Failed runs return 500, lock conflicts 409. A normal bounded batch can finish with pending work for the next run. A shutdown records `interrupted` without advancing success. File-level errors remain in the existing DB metadata status. Fix/requeue failed files through the application's existing maintenance workflow.

Independent discovery, metadata refresh, and thumbnail creation, including forced repair, ownership rules, and CLI/API options, are documented in [background processing](background-processing.md).

## Shutdown

Production starts a small Node launcher which disables Next's immediate signal exit and closes the HTTP listener on SIGTERM/SIGINT, draining accepted requests. New readiness checks fail while shutting down. Signal listeners terminate active media children; tool failures are awaited before releasing the indexing lock. Next runs as UID 1000 beneath Docker's init process, which forwards signals and reaps children. The launcher exits after draining, or exits nonzero after 170 seconds. Compose allows 180 seconds for web/background and 20 for scheduler; DB has 60 seconds. LONG_PROCESS_TIMEOUT_SEC defaults to a 120-second batch budget (allowed 1–600); that budget is checked between work units and is not a hard per-request deadline. If your measured sync/request duration approaches the grace period, tune the launcher deadline and Compose grace together and rehearse shutdown with your largest workload. Use the default 120-second budget until doing that validation.

## Storage configuration and transition

APP_STORAGE_PATH is the **mounted generated-storage root**, passed into every Compose app role. APP_THUMBNAIL_SUBDIRECTORY is a relative directory beneath it, default `thumbnail`. Paths escaping/equal to the root are rejected. The default remains `/mnt/storage/thumbnail`. Operational state and locks live in the sibling `operations` directory. Source media remains read-only. Backup tooling now identifies the actual APP_STORAGE_PATH mount and requires identical container paths during restore.

Before changing storage configuration, stop writers, take a verified backup and preserve the same named volume/project. Installations that manually passed APP_STORAGE_PATH to the old code as the full thumbnail directory must move to the root/subdirectory convention deliberately; inspect the existing layout first. Compose previously used it only as a mount destination. Changing that destination does not move files in the volume: retain the existing thumbnail-relative layout. Fresh volumes at a custom destination may initially be root-owned because Docker cannot copy ownership from `/mnt/storage` at another image path. With consumers stopped, use the README's targeted one-time ownership repair on **only this generated-storage volume**, then probe writing as UID 1000. Never chown source media or database storage. This applies to legacy incompatible volume ownership too.

A non-default configuration such as APP_STORAGE_PATH=/srv/hmv-generated and APP_THUMBNAIL_SUBDIRECTORY=previews must pass readiness, actual thumbnail writes, web reads, backup mount detection and restart persistence before scheduling is enabled. The isolated validation in section 8 exercises this layout.

## Host monitoring

```sh
python3 scripts/operations/check.py \
  --compose-file docker-compose-prod.yml --env-file /secure/hmv.env --project media \
  --backup-directory /srv/backups/hmv --docker-data-directory /var/lib/docker
```

Run as an account authorized to inspect Docker and read filesystem statistics/backup manifests. The DB datadir is probed inside db. Supply Docker's actual host data root for logs, or the log filesystem path if relocated; add your host monitor's disk checks for separate bind mounts/filesystems. The probe reports DB/container health, OOM/restart counts, readiness, DB/generated free bytes, last indexing outcome/success/failures, and complete local backup age. It exits 1 on unavailable probes, unhealthy containers, indexing failure/interruption, success older than 15 minutes, backup older than 26 hours, or less than 2 GiB available on any checked filesystem. Thresholds are CLI options; choose staging space sufficient for a whole new backup plus retention. A missing first backup/indexing run deliberately alerts. Future-dated backup manifests do not count. Backup age trusts the completed local manifest; checksum verification and off-host freshness need separate backup-job monitoring.

For a systemd installation, create a oneshot service with the command above as ExecStart, WorkingDirectory pointing to this release checkout, and OnFailure pointing to your existing notification unit. Add a timer with OnBootSec=2min, OnUnitActiveSec=1min and enable it through your deployment manager. Send stdout/stderr to journald with host journal rotation. Verify a deliberate low-space threshold and a missing-backup fixture generate an alert and a healthy subsequent run clears it. A timer without working alert delivery is not operational monitoring. No host timer, public proxy or external notification service is modified by this repository change.

Focused regression commands (inside the development dependency container, mounting the checkout at `/workspace`):

```sh
TS_NODE_PROJECT=/workspace/home-media-viewer/tsconfig.json \
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
node /workspace/docker/test/operations.test.cjs
python3 /workspace/docker/test/operations-monitor.test.py
```
