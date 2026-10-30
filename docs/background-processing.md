# Independent background processing stages

Processing supports three stages, always ordered as discovery → metadata → thumbnails. Selecting one stage runs only that stage. Full indexing selects all three.

| Stage | Work | Persistent state |
| --- | --- | --- |
| `discovery` | Reconcile album roots and directories; attach files; detect source changes | File/album relationships and source identity; invalidate affected derived stages |
| `metadata` | Read filesystem/media metadata; publish extracted values and content date | Metadata values, filesystem fields, `metadataStatus`, metadata error/date/source version |
| `thumbnails` | Generate the configured 200/600/1280 previews | Preview files, `thumbnailStatus`, thumbnail error/date/source version |

Metadata-only jobs preserve thumbnail bytes and every thumbnail state field. Thumbnail-only jobs preserve metadata values and metadata state, dates, and filesystem fields. Neither media stage discovers files or processes directories. Thumbnail generation does not require successful metadata extraction. Metadata extraction does not generate previews. Unsupported stage/media combinations become `NotSupported` independently.

## Admin API

`POST /api/process/run` requires an authenticated administrator session, using the application's existing session cookie. It accepts a JSON body:

```json
{
  "stages": ["thumbnails"],
  "fileId": "existing-file-id",
  "mode": "refresh",
  "timeoutSec": 120,
  "workers": 2
}
```

- `stages`: a nonempty, duplicate-free array of `discovery`, `metadata`, and/or `thumbnails`. Omission selects all stages. The supplied order does not change execution order.
- Scope: omit both identifiers for the indexed library, use `albumId` for an existing album, or `fileId` for one existing regular-file record. Identifiers are mutually exclusive. File scope requires explicit media stages and cannot include discovery. Library/album queues select active files in active or disabled albums; explicit file scope also permits disabled files.
- `mode`: `pending` (default) selects each requested media stage by its own `New` status. `refresh` reruns requested stages even when already processed, failed, or unsupported. Discovery reconciles whenever selected, regardless of mode. Error recovery and historical repair are explicit refresh operations; no metadata deletion is needed.
- `timeoutSec`: finite number from 1 to 600 (runner default 50). `workers`: integer from 1 to 4 (runner default two, clamped to available parallelism; development uses one worker). These are dispatch budgets, not hard deadlines for active decoding or recursive discovery. I4/I5 will improve discovery bounds and queue dispatch.

Unknown options, invalid combinations, missing scopes, and directory file-scopes return 400. Non-admins receive 403; lock contention returns 409. Completed/partial jobs return 200 with `data.outcome` and per-stage attempted/succeeded/failed/not-supported/deferred counts. Stage failures return 500 with the independent stage statistics. Infrastructure failures return 503. A completed stage never implies that another stage succeeded.

All mutating indexing jobs share the existing storage-volume lock, including manual refresh, metadata reset/edit, album creation, discovery, and the scheduled runner. Nested helpers within one job share its ownership; separate requests and processes cannot bypass the lock. Do not remove a lock while any writer could still be active. Existing fail-closed recovery rules in [operations](operations.md) still apply.

## CLI and compatibility

In the development/tooling environment containing the existing TypeScript CLI and dependencies:

```sh
docker compose exec app npm run bgprocess -- --stages metadata --album existing-album-id --mode refresh
docker compose exec app npm run bgprocess -- --stages thumbnails --file existing-file-id --mode refresh
docker compose exec app npm run bgprocess -- --stages discovery --timeout 120 --workers 2
```

CLI flags are `--stages` (comma-separated), `--mode`, `--album`, `--file`, `--timeout`, and `--workers`. Repeated or unknown flags are rejected. File scope defaults to both media stages when `--stages` is omitted. No arguments retain full-library pending indexing. Exit codes: 0 success, 1 failure/invalid options, 2 incomplete work. The client disconnects before exit. The packaged standalone server continues to expose HTTP controls; the TypeScript CLI requires the tooling environment.

The scheduler and bearer-authenticated `GET /api/process/updateMetadata` retain full pending indexing by default. Legacy album sync retains full indexing. Legacy file metadata POST retains forced metadata-plus-thumbnail refresh for regular files and discovery-only reconciliation for directories; legacy album metadata POST retains pending metadata-plus-thumbnail processing. The new admin endpoint provides explicit stage isolation without changing those default entry points. Admin checks remain in place on the legacy manual routes. Metadata DELETE still explicitly removes all values and queues metadata again; it does not reset thumbnails.

## Metadata ownership and source consistency

Extraction collects values in memory and publishes them in a short transaction after successful extraction and source checks. A successful refresh replaces values marked `Extracted`, removes extracted keys absent from the new extraction, and preserves `Manual` and `Legacy` values. Admin edits are marked `Manual`. A protected `dateTime` value also controls the refreshed content date; otherwise extraction replaces or clears a stale content date. Failed extraction preserves previous values and records only metadata failure. Concrete stale row IDs avoid unnecessary index-range locks. Only fully rolled-back `P2034` conflicts retry the complete transaction, with at most three retries; ambiguous connection/write errors are not retried. See [Prisma's error reference](https://docs.prisma.io/docs/orm/reference/error-reference).

The additive migration `20261028190000_independent_processing_stages` marks historical metadata `Legacy`: its origin cannot be reconstructed reliably. Historical values are deliberately preserved, including values that may once have been extracted. Explicit metadata deletion is the existing way to clear them before re-extraction. Migration does not change existing statuses, timestamps, values, or enqueue the library. Apply migrations and regenerate Prisma before running the new code; use the existing migration/deployment workflow. No database reset or source-media change is required.

Source identity includes device, inode, size, modification time, and change time. Discovery invalidates both derived stages when that identity changes; legacy records establish identity lazily using size/mtime comparison, without requeueing unchanged content. Each stage records the version it actually read. Media jobs check source identity before publication; a change during processing leaves that stage `New` for retry and retains prior usable data. Filesystem changes after the final check are reconciled by subsequent discovery; no filesystem snapshot or cross-process source lock is claimed.

Thumbnail generation writes all sizes into a private directory, checks the source, then atomically renames each output. State becomes `Processed` only after all required sizes are published. Caught publication/database failures restore previous outputs. A process crash can leave private temporary files or partially published sizes; the stage stays `New` until retry. There is no atomic transaction spanning the filesystem and MariaDB. Single-decode generation and further publication improvements remain I6; custom video frame times remain I10.

Discovery statistics are separate from media statuses. Resumable discovery cursors are I4; bounded queue pages/continuous workers are I5; durable per-stage run summaries are I8. Detailed statistics remain process-local and disappear on restart, while stage status/version/error fields and the existing overall run state persist.

## Validation

Run the isolated migration, real-media, failure, lock, API, and CLI acceptance suite:

```sh
python3 scripts/benchmark/run.py --validate-stages --output /tmp/hmv-stage-validation-results
```

The output directory must be new. The runner builds the working tree, checks migration preservation using a historical row, seeds a generated administrator, creates task fixtures, starts production app/background services, and executes [processing-stages.cjs](../docker/test/processing-stages.cjs). Source mounts remain read-only. All private credentials, fixture copies, containers, image tags, networks, and volumes are removed after recording results. Keep the output directory only when intentionally retaining the validation artifact.
