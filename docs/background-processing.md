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
- `timeoutSec`: finite number from 1 to 600 (runner default 50). `workers`: integer from 1 to 4 (runner default two, clamped to available parallelism; development uses one worker). These are dispatch budgets. Discovery checkpoints between bounded batches; media workers stop taking new work at the deadline and drain active work. Active filesystem/database calls and media decoding may finish after the budget.

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

## Resumable discovery

The additive `20261030120000_resumable_discovery` migration creates `DiscoveryDirectory` without changing existing media rows or enqueuing the library. `20261031100000_discovery_scan_version` adds directory identity while preserving existing queue rows/cursors; their first selected scan safely restarts when no identity was recorded. Apply migrations and regenerate Prisma before running discovery. Tasks are created lazily for selected album roots and discovered subdirectories. Each task stores its filename cursor, reconciliation ID cursor, directory version, and last-served time. Runs rotate tasks by oldest service time, so later album roots and directories get turns while an earlier import remains unfinished. Full/composed runs reserve half the dispatch budget for existing media work.

Entry and reconciliation pages contain at most 64 records; source stats run in groups of at most eight asynchronous calls. Directory listings use asynchronous directory entries and are cached once per physical directory per run. A complete listing is still held in memory and sorted; very wide directory enumeration and active filesystem/database calls are not cancellable hard deadlines. Membership comparisons use sets/maps, and containing-album information is cached. Nested albums share existing file records and acquire their containing memberships/parent links.

Interrupted entry/reconciliation work resumes from durable cursors after restart. If the directory identity changes, its cursors restart before absence checks. An unreadable or unstable listing never authorizes deletion of unvisited files; a missing subtree is marked deleted only after a successful reconciliation of its containing directory. Removed files retain their records and return to `Active` when rediscovered. Discovery checks size/mtime and persisted source identity, including same-size changes, and invalidates both derived stages without extracting metadata or generating previews. Symlink entries are not traversed, preventing directory cycles; symlink-only content is outside this discovery traversal.

Discovery statistics count unique attempted directory tasks, completed/failed tasks, and unfinished tasks as deferred. They are separate from media statuses. Durable per-stage run summaries remain I8. Detailed statistics remain process-local and disappear on restart, while discovery cursors, stage status/version/error fields, and the existing overall run state persist.

## Paged media queues

Media dispatch reads at most 64 unique file records per page, ordered by ID with exclusive keyset bounds. Pending selectors independently check the selected stages' `New` statuses. Album relationships use an existence filter, so overlapping albums do not duplicate a file. Queue memory holds one page and the current workers' records; counting processed files or remaining work does not retain a library-sized ID set or file array. Discovery's separate listing cache and active media-decoder memory still have the limits described above.

Each worker takes another file immediately after finishing its current file. Metadata precedes thumbnails within a file when both are selected; unrelated slow files do not form a batch barrier. Either stage still runs independently of the other's failure. Worker limits are unchanged; development retains one worker and its 300 ms delay.

The additive `20261031120000_media_queue_cursor` migration creates a lazy `MediaQueueCursor` table without changing media state or enqueuing the library. Apply migrations and regenerate Prisma before using the runner. Library and album jobs save separate dispatch positions for each mode/stage selection. Explicit file jobs need no fairness cursor. A bounded job resumes after its saved ID, wraps once to IDs at or below that starting position, and attempts each selected file at most once per invocation. A complete refresh still refreshes the whole eligible scope; repeated partial refreshes advance instead of repeatedly refreshing the earliest records. Pending work left `New` by interruption/source changes also gets another turn after wrapping. Removed cursor files do not break continuation.

Cursors checkpoint dispatched positions at page boundaries and after workers drain, never the end of an unconsumed page. A crash may repeat dispatch since the last checkpoint; file statuses remain the authoritative backlog, and media publication/retry behavior is unchanged. New work that appears behind the current position is picked up on wrapping or the next invocation. This is not a database snapshot of a changing library.

The deadline stops new file claims; each already claimed file finishes its selected stages under the shared writer lock. This ensures slow metadata cannot starve thumbnails during repeated short refreshes. A job can therefore exceed its dispatch budget by an active file’s complete stage pipeline. Shutdown stops new claims and later stages that have not started, with existing subprocess signal cancellation/timeouts still active. Paging/checkpoint failures also stop dispatch and wait for every active worker before releasing the lock. Pending `deferred` counts report remaining `New` records, including attempted work that needs retry; refresh counts include unattempted files plus attempts explicitly deferred by a stage. Per-stage failure reporting remains independent.

## Validation

Run the isolated migration, real-media, failure, lock, API, and CLI acceptance suite:

```sh
python3 scripts/benchmark/run.py --validate-stages --output /tmp/hmv-stage-validation-results
```

The output directory must be new. The runner builds the working tree, checks migration preservation using historical media/queue rows, seeds a generated administrator, creates task fixtures, starts production app/background services, and executes [processing-stages.cjs](../docker/test/processing-stages.cjs), [discovery.cjs](../docker/test/discovery.cjs), and [media-queue.cjs](../docker/test/media-queue.cjs). Discovery checks use a disposable writable source tree. Queue checks use controlled processors against MariaDB for status changes, overlap, skewed jobs, restart/deadline/shutdown/rejection handling, plus large virtual queues for bounded paging/heap evidence. The existing stage suite still exercises real extraction, generation and HTTP controls. Normal source mounts remain read-only. All private credentials, fixture copies, containers, image tags, networks, and volumes are removed after recording results. Keep the output directory only when intentionally retaining the validation artifact.

## Media decoding and tool limits

Image thumbnail jobs decode once and resize independent clones of the oriented original for each size. JPEG quality remains 50 for 200px and 75 for 600/1280px; decoded JPEG ancillary fields are retained. Video thumbnail jobs use one FFmpeg invocation with a split filter graph so all three outputs use the same first frame. Video previews retain width-based scaling, aspect ratio, automatic rotation, JPEG defaults and existing names. No frame-time option is added here.

Video metadata uses one JSON ffprobe invocation containing streams and format tags. Container tags precede stream fallbacks for manufacturer, model, encoder and location, including namespaced keys. The selected video stream's creation time retains precedence over the container date. FPS uses the finite positive `avg_frame_rate` ratio, falling back to `r_frame_rate`; fractional rates are preserved without parsing rounded display text.

FFmpeg decoders, encoders and the split filter graph use one thread each; ffprobe receives the same thread bound. The existing media subprocess wrapper retains its 30-second timeout, 4 MiB output buffer, shutdown signal cancellation and forced timeout kill. Worker and container resource caps remain unchanged. Jimp decoding/resizing still runs in-process; shutdown is checked between image variants, but cannot preempt synchronous image work. Failed or interrupted generation uses private temporary files, leaving previous previews usable through the existing publication/rollback protocol and updating only the thumbnail stage.
