# Independent background processing stages

Processing supports three stages, always ordered as discovery → metadata → thumbnails. Selecting one stage runs only that stage. Full indexing selects all three.

| Stage | Work | Persistent state |
| --- | --- | --- |
| `discovery` | Reconcile album roots and directories; attach files; detect source changes | File/album relationships and source identity; invalidate affected derived stages |
| `metadata` | Read filesystem/media metadata; publish extracted values and content date | Metadata values, filesystem fields, `metadataStatus`, metadata error/date/source version |
| `thumbnails` | Generate the configured 200/600/1280 previews | Preview files, `thumbnailStatus`, thumbnail error/date/source version; successful explicit video frame selection |

Metadata-only jobs preserve thumbnail bytes and every thumbnail state field. Thumbnail-only jobs preserve unrelated metadata values and metadata state, dates, and filesystem fields; successful explicit video frame selections update only the `video_thumbnail_time` metadata value. Neither media stage discovers files or processes directories. Thumbnail generation does not require successful metadata extraction. Metadata extraction does not generate previews. Unsupported stage/media combinations become `NotSupported` independently.

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
- `videoThumbnailTimeSec`: optional finite nonnegative seconds (zero and fractions supported); requires the thumbnails stage. Applies to videos in the selected scope; images keep ordinary generation. Custom times must be strictly less than the video duration. Omission uses saved `video_thumbnail_time` metadata when present; otherwise it retains the first frame without an extra probe. Use `mode: "refresh"` to regenerate already processed previews; pending mode still selects only `New` thumbnail work.
- `timeoutSec`: finite number from 1 to 600 (runner default 50). `workers`: integer from 1 to 4 (runner default two, clamped to available parallelism; development uses one worker). These are dispatch budgets. Discovery checkpoints between bounded batches; media workers stop taking new work at the deadline and drain active work. Active filesystem/database calls and media decoding may finish after the budget.

Unknown options, invalid combinations, missing scopes, and directory file-scopes return 400. Non-admins receive 403; lock contention returns 409. Completed/partial jobs return 200 with `data.outcome` and per-stage attempted/succeeded/failed/not-supported/deferred counts. Stage failures return 500 with the independent stage statistics. Infrastructure failures return 503. A completed stage never implies that another stage succeeded.

All mutating indexing jobs share the existing storage-volume lock, including manual refresh, metadata reset/edit, album creation, discovery, and the scheduled runner. Nested helpers within one job share its ownership; separate requests and processes cannot bypass the lock. Do not remove a lock while any writer could still be active. Existing fail-closed recovery rules in [operations](operations.md) still apply.

## CLI and compatibility

In the development/tooling environment containing the existing TypeScript CLI and dependencies:

```sh
docker compose exec app npm run bgprocess -- --stages metadata --album existing-album-id --mode refresh
docker compose exec app npm run bgprocess -- --stages thumbnails --file existing-file-id --mode refresh --video-thumbnail-time 1.5
docker compose exec app npm run bgprocess -- --stages discovery --timeout 120 --workers 2
```

CLI flags are `--stages` (comma-separated), `--mode`, `--album`, `--file`, `--timeout`, `--workers`, and `--video-thumbnail-time` (seconds). Repeated or unknown flags are rejected. File scope defaults to both media stages when `--stages` is omitted. No arguments retain full-library pending indexing. Exit codes: 0 success, 1 failure/invalid options, 2 incomplete work. The client disconnects before exit. The packaged standalone server continues to expose HTTP controls; the TypeScript CLI requires the tooling environment.

The scheduler and bearer-authenticated `GET /api/process/updateMetadata` retain full pending indexing by default. Legacy album sync retains full indexing. Legacy file metadata POST retains forced metadata-plus-thumbnail refresh for regular files and discovery-only reconciliation for directories; legacy album metadata POST retains pending metadata-plus-thumbnail processing. The new admin endpoint provides explicit stage isolation without changing those default entry points. Admin checks remain in place on the legacy manual routes. Metadata DELETE still explicitly removes all values and queues metadata again; it does not reset thumbnails.

## Metadata ownership and source consistency

Extraction collects values in memory and publishes them in a short transaction after successful extraction and source checks. A successful refresh replaces values marked `Extracted`, removes extracted keys absent from the new extraction, and preserves `Manual` and `Legacy` values. Admin edits are marked `Manual`. A protected `dateTime` value also controls the refreshed content date; otherwise extraction replaces or clears a stale content date. Failed extraction preserves previous values and records only metadata failure. Concrete stale row IDs avoid unnecessary index-range locks. Only fully rolled-back `P2034` conflicts and MariaDB deadlocks (`P2010` with database code `1213` for raw SQL, including Prisma 7 adapter metadata) retry the complete transaction, with at most three retries; other raw errors, lock timeouts and ambiguous connection/write errors are not retried. See [Prisma's error reference](https://docs.prisma.io/docs/orm/reference/error-reference).

The additive migration `20261028190000_independent_processing_stages` marks historical metadata `Legacy`: its origin cannot be reconstructed reliably. Historical values are deliberately preserved, including values that may once have been extracted. Explicit metadata deletion is the existing way to clear them before re-extraction. Migration does not change existing statuses, timestamps, values, or enqueue the library. Apply migrations and regenerate Prisma before running the new code; use the existing migration/deployment workflow. No database reset or source-media change is required.

Source identity includes device, inode, size, modification time, and change time. Discovery invalidates both derived stages when that identity changes; legacy records establish identity lazily using size/mtime comparison, without requeueing unchanged content. Each stage records the version it actually read. Media jobs check source identity before publication; a change during processing leaves that stage `New` for retry and retains prior usable data. Filesystem changes after the final check are reconciled by subsequent discovery; no filesystem snapshot or cross-process source lock is claimed.

Thumbnail generation writes all sizes into a private directory, checks the source, then atomically renames each output. State becomes `Processed` only after all required sizes are published. Caught publication/database failures restore previous outputs. A process crash can leave private temporary files or partially published sizes; the stage stays `New` until retry. There is no atomic transaction spanning the filesystem and MariaDB. Generation reuses decoded images/video frames as described below. Custom video times use one limited timing probe and one accurate input seek before the shared split graph, so every size uses the same frame. This probe reads duration only and does not extract or persist media metadata. A missing/unknown duration, time at or beyond the end, or no decodable frame at the requested timestamp fails the thumbnail stage with a clear stored thumbnail error; the API reports a stage failure (500). Invalid numeric options return 400 before dispatch. Failed probing/generation preserves previous usable previews and metadata. Explicit custom time is recorded in the run summary and saved after successful generation/publication as `video_thumbnail_time` metadata (type `Float`, origin `Manual`, seconds). Its metadata write and thumbnail completion status share one database transaction; a transaction failure restores previous previews and leaves the previous selection unchanged. Later regeneration without an explicit time uses this saved value, including zero and fractions. Metadata refresh preserves it; explicit metadata deletion removes it along with other values. If a saved value is invalid and any existing thumbnail is available, regeneration fails and preserves that thumbnail. If no thumbnail is available, regeneration uses the default first frame and retains the saved value. Explicit invalid times always fail.

## Rollout and deliberate repair

Use the existing [release/update procedure](database-lifecycle.md) with the same Compose project, database and generated-storage volumes. Stop the scheduler and all web/background/manual writers, take a verified [backup](../scripts/backup/README.md), deploy migrations with the matching release migration image, and start the updated consumers only after migration succeeds. Keep source mounts read-only. Packaged images contain the generated Prisma client; source/tooling installations must regenerate it after schema updates. Do not reset the database or run old writers against the new processing contract during rollout.

The processing changes add these migrations, in order:

| Migration | Effect on existing content |
| --- | --- |
| `20261028190000_independent_processing_stages` | Adds independent source/error state and metadata ownership; existing metadata becomes protected `Legacy` |
| `20261030120000_resumable_discovery` | Creates durable directory work; preserve the deployed migration checksum |
| `20261031100000_discovery_scan_version` | Adds directory scan identity; retained queue cursors safely restart on their first selected scan |
| `20261031120000_media_queue_cursor` | Creates lazy media continuation cursors |
| `20261031140000_media_queue_indexes` | Adds measured stage-queue indexes; no content rewrite |

No migration automatically reprocesses the library, deletes metadata/previews, or changes successful stage timestamps. Run history starts with the first new job; no historical counts are invented. Readiness must return 200 with no unfinished migration before scheduling resumes. For an existing installation, retain the existing administrator; seeding is a separate first-installation step.

Begin with a small existing file or album through the admin API. Check the durable run outcome and independent file-stage states, view all preview sizes, then enable one scheduler. For explicit historical repair, use `mode: "refresh"` with only the affected stage. For example:

```json
{"stages":["thumbnails"],"albumId":"existing-album-id","mode":"refresh","timeoutSec":120}
```

This repairs failed or missing previews even if their historical state says `Processed`; metadata stays intact. Metadata-only refresh replaces extracted values while preserving Manual/Legacy values, so it is not a way to erase protected historical keys. A partial refresh can be repeated to advance its durable cursor; a completed refresh run returns to the normal pending scheduler flow. Inspect failures before retrying; pending mode deliberately excludes `Error` and already processed stages. When continuing a partial custom refresh, supply the explicit time again to apply it to files not yet processed; files already completed retain their saved selections. Verify retained results after restart. For interrupted runs or persistent locks, follow the [fail-closed recovery procedure](operations.md#scheduling-authentication-and-overlap); elapsed time alone never authorizes lock removal.

Existing entry points retain the composition described above. If a release must be rolled back, stop all consumers and follow the paired database/generated-storage recovery procedure; retaining an old app image alone does not undo schema or ownership changes.

## Resumable discovery

The additive `20261030120000_resumable_discovery` migration creates `DiscoveryDirectory` without changing existing media rows or enqueuing the library. `20261031100000_discovery_scan_version` adds directory identity while preserving existing queue rows/cursors; their first selected scan safely restarts when no identity was recorded. Apply migrations and regenerate Prisma before running discovery. Tasks are created lazily for selected album roots and discovered subdirectories. Each task stores its filename cursor, reconciliation ID cursor, directory version, and last-served time. Runs rotate tasks by oldest service time, so later album roots and directories get turns while an earlier import remains unfinished. Full/composed runs reserve half the dispatch budget for existing media work.

Entry and reconciliation pages contain at most 64 records; source stats run in groups of at most eight asynchronous calls. Directory listings use asynchronous directory entries and are cached once per physical directory per run. A complete listing is still held in memory and sorted; very wide directory enumeration and active filesystem/database calls are not cancellable hard deadlines. Membership comparisons use sets/maps, and containing-album information is cached. Nested albums share existing file records and acquire their containing memberships/parent links.

Interrupted entry/reconciliation work resumes from durable cursors after restart. If the directory identity changes, its cursors restart before absence checks. An unreadable or unstable listing never authorizes deletion of unvisited files; a missing subtree is marked deleted only after a successful reconciliation of its containing directory. Removed files retain their records and return to `Active` when rediscovered. Discovery checks size/mtime and persisted source identity, including same-size changes, and invalidates both derived stages without extracting metadata or generating previews. Symlink entries are not traversed, preventing directory cycles; symlink-only content is outside this discovery traversal.

Discovery statistics count unique attempted directory tasks, completed/failed tasks, and unfinished tasks as deferred. They are separate from media statuses. Scoped per-stage run summaries persist on the shared storage volume as described below. Discovery cursors and file stage status/version/error fields remain the authoritative work queues.

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

The output directory must be new. The runner builds the working tree, checks migration preservation using historical media/queue rows, seeds a generated administrator, creates task fixtures, starts production app/background services, and executes the processor checks plus [video-thumbnail-time.cjs](../docker/test/video-thumbnail-time.cjs), [processing-stages.cjs](../docker/test/processing-stages.cjs), [discovery.cjs](../docker/test/discovery.cjs), and [media-queue.cjs](../docker/test/media-queue.cjs). Discovery checks use a disposable writable source tree. Queue checks use controlled processors against MariaDB for status changes, overlap, skewed jobs, restart/deadline/shutdown/rejection handling, plus large virtual queues for bounded paging/heap evidence. The existing stage suite still exercises real extraction, generation and HTTP controls. Database checks also exercise real bulk-write rollback, source changes, idempotency, ownership, deadlock retry and pool availability; query-plan checks capture production page SQL against a disposable 32,768-file library and compare actual MariaDB plans before/after the queue indexes. Normal source mounts remain read-only. All private credentials, fixture copies, containers, image tags, networks, and volumes are removed after recording results. Keep the output directory only when intentionally retaining the validation artifact.

## Media decoding and tool limits

Image thumbnail jobs decode once and resize independent clones of the oriented original for each size. JPEG quality remains 50 for 200px and 75 for 600/1280px; decoded JPEG ancillary fields are retained. Video thumbnail jobs use one FFmpeg invocation with a split filter graph so all three outputs use the same selected frame (the first frame by default). Video previews retain width-based scaling, aspect ratio, automatic rotation, JPEG defaults and existing names. Custom times use FFmpeg’s microsecond precision and add a limited duration probe; thumbnail-only jobs still leave persisted metadata untouched.

Video metadata uses one JSON ffprobe invocation containing streams and format tags. Container tags precede stream fallbacks for manufacturer, model, encoder and location, including namespaced keys. The selected video stream's creation time retains precedence over the container date. FPS uses the finite positive `avg_frame_rate` ratio, falling back to `r_frame_rate`; fractional rates are preserved without parsing rounded display text.

FFmpeg decoders, encoders and the split filter graph use one thread each; ffprobe receives the same thread bound. The existing media subprocess wrapper retains its 30-second timeout, 4 MiB output buffer, shutdown signal cancellation and forced timeout kill. Worker and container resource caps remain unchanged. Jimp decoding/resizing still runs in-process; shutdown is checked between image variants, but cannot preempt synchronous image work. Failed or interrupted generation uses private temporary files, leaving previous previews usable through the existing publication/rollback protocol and updating only the thumbnail stage.

## Database publication and queue indexes

Metadata extraction finishes before a publication transaction starts. Extracted values are written with parameterized multi-row upserts in chunks of at most 128; existing per-key IDs are retained, obsolete typed fields are cleared, and Manual/Legacy values stay protected. Stale Extracted rows are deleted by concrete IDs in bounded chunks. All chunks, the final source check and the file's metadata success state share one transaction, so partial writes or a changed source cannot publish partial metadata. File state writes use affected-row counts when the updated row is not otherwise needed.

Discovery writes at most eight statted entries per transaction. New file records, album memberships (128 pairs per statement), changed existing rows and child-directory enqueues commit together. Existing rows with different source identities still receive individual updates. Checkpoints advance only after the group commits; failed groups can be rediscovered without leaving partial file/membership records. No filesystem enumeration, stat batch or media extraction runs inside these discovery transactions.

The additive `20261031140000_media_queue_indexes` migration adds `(status, isDirectory, metadataStatus, id)` and `(status, isDirectory, thumbnailStatus, id)` indexes to `File`. These cover sparse stage predicates and ID paging; existing path/search/parent indexes are retained. Measurements use the actual production Prisma SQL with bound parameters and MariaDB `EXPLAIN`/`ANALYZE FORMAT=JSON`, including sparse/dense queues, overlapping/small albums and saved cursors. Sparse queues benefit; dense refresh plans can still use album relationship indexes and sorting, so those plans are not claimed improved. The migration changes no file/metadata values, statuses or cursors and does not enqueue work. Apply through the normal migration/deployment workflow and regenerate Prisma.

The shared Prisma connection budget and worker cap are unchanged. Isolated contention checks verify that an unrelated file progresses while another row is locked, and that four active transactions leave the fifth configured connection available for readiness reads. This does not reserve a connection under arbitrary external database load.

## Durable run summaries and scheduling

The runner atomically writes `operations/runs/<UUID>.json` and a latest-run pointer on the shared generated-storage volume. It retains the most recent 100 records. Each record contains library/album/file scope (IDs only), pending/refresh mode, worker/dispatch budget, optional custom video thumbnail time, per-stage confirmed counts and backlog snapshots, stage/run durations, outcome and stop reason. The existing authenticated background `GET /api/process/lastProcessStatistics` returns `run` and the compatible `data` statistics after restart; `?runId=<UUID>` selects retained history. The runner/API/CLI result includes its `runId`. While a run is active, use `run` for progress; compatible `data` is populated when that run completes. Invalid IDs return 400 and expired/unknown IDs 404. No schema migration or automatic backfill is required.

Media attempts are journaled before work and after completion. Updates serialize across workers so concurrent completions cannot overwrite counts. `counts.deferred` retains its existing meaning (remaining selected work, including retryable attempts), while `retryable` counts attempted work explicitly deferred by the processor. It is not an additional disjoint outcome to add to remaining backlog. `inFlight` counts active attempts and `unresolved` retains attempts whose final outcome cannot be confirmed after interruption. Discovery counts unique directory tasks rather than individual entry pages; its checkpoint progress and remaining tasks are recorded independently of media counts. `selectedBefore`/`pendingBefore` are starting observations, `pendingAfter` is the final New/directory backlog, and `remaining` is selected unfinished work (including unattempted refresh records). Unknown observations remain null after infrastructure failure. Discovery/source changes can add work during a run; these are observations rather than a library snapshot.

Stage `durationMs` measures the span of its recorded work, rather than queue initialization/final count queries; concurrent stages/workers may overlap. Media `processingMs` sums elapsed per-attempt work excluding journal I/O and can exceed wall time under concurrency; discovery records its stage span. Run duration includes orchestration and checkpoint overhead. Failure in thumbnails retains independently successful metadata counts/state. A dispatch deadline with backlog is `partial`/`deadline`; a fully drained queue remains `success`/`drained` even when the last claimed file finishes after its budget. Cooperative shutdown records `interrupted`/`shutdown`; infrastructure and stage failures have separate reasons. Partial/shutdown runs do not update the legacy last-success timestamp.

Only a later safely acquired writer lock can classify a previous unfinished run as `interrupted`/`abandoned`. A crashed writer keeps its lock closed. Status reads never expire it or decide that an old PID/timestamp proves a writer is dead. Confirm every writer has stopped before following the [operations recovery procedure](operations.md). An abandoned record keeps its last confirmed counts and checkpoint duration, no inferred finish time, and unresolved in-flight attempts. A crash between MariaDB publication and journal completion can leave an outcome unresolved. Nested helpers share the writer lock; overlapping runner journals under one parent ownership are rejected.

Scheduler settings are `BACKGROUND_INTERVAL_SEC` (default 180, integer 1–86400), `BACKGROUND_CATCHUP_INTERVAL_SEC` (default 30, 1 through idle interval), and `BACKGROUND_MAX_BACKOFF_SEC` (default 900, at least idle interval and at most 86400). Catch-up applies only to deadline-limited partial runs with backlog. Other partial runs use idle cadence. Consecutive failures wait one idle interval, then twice, four times, and so on up to the cap; success/409 reset backoff, and 409 waits the idle interval. Configuring a shorter idle interval may require lowering catch-up too; a longer interval may require raising the backoff cap. Requests never overlap within a scheduler.

The HTTP timeout covers dispatch budget plus 120 seconds, including bounded response consumption (64 KiB). Media tools retain 30-second timeouts; shutdown signals tools and stops new claims. The launcher/Compose grace remains 170/180 seconds for app/background and 20 seconds for scheduler. Unpreemptible filesystem/image work can exceed dispatch/drain allowances; HTTP abort does not release the server's lock. See [operations](operations.md) for shutdown and fail-closed recovery.

## Fixture performance record (2026-10-31)

The final implementation passed 79 isolated integration groups plus scheduler, operations, monitoring and HTTP shutdown regressions. A separate nine-scenario matrix ran three repetitions per scenario in production mode, using the [benchmark tooling](../scripts/benchmark/README.md) with `--measure-stages --budget-seconds 120`. All 27 runs drained their selected queues with zero stage failures; every health/authenticated foreground API probe returned 200. The 602-file fixture hash matched the original baseline.

These measurements use Node 26.12.1, FFmpeg/ffprobe 7.1.5, MariaDB 13.0.2, two media workers in a 2-CPU/2-GiB container, a separate 1-CPU/1-GiB foreground app and 1-CPU/1-GiB DB, and five connections per application process. Wall time and SQL counts are medians of three runs; RSS is the largest worker lifetime peak, including startup.

| Scenario | Wall seconds | SQL statements | Peak RSS MiB |
| --- | ---: | ---: | ---: |
| Initial full | 20.114 | 9,408 | 508.6 |
| Unchanged full | 1.288 | 1,029 | 204.4 |
| Size change + full | 1.492 | 1,052 | 244.5 |
| Same-size change + full | 1.504 | 1,052 | 245.1 |
| Initial discovery | 1.960 | 1,394 | 208.9 |
| Unchanged discovery | 1.293 | 1,022 | 204.6 |
| Independent discovery | 1.776 | 1,394 | 207.4 |
| Metadata only | 2.714 | 4,381 | 208.5 |
| Thumbnails only | 16.660 | 3,689 | 537.2 |

Initial full indexing used 99 image decodes, three FFmpeg jobs and three metadata probes, compared with 297/nine/six in the original implementation. Its median CPU time was 30.486 seconds, summed SQL time 3.136 seconds, foreground API p95 20.1 ms, foreground readiness p95 4.4 ms, indexing liveness p95 89.5 ms and event-loop p95 67.3 ms. Per-run initial-full latency probes had at least 149 samples per endpoint. Thumbnail-only liveness p95 was 171.3 ms while foreground API p95 was 20.4 ms; Jimp still executes synchronous work inside the indexing process. Default thumbnail-only runs launched no metadata probes, and metadata-only runs launched no FFmpeg/image thumbnail decoding. Custom times add their limited probe, as validated separately.

The historical full baseline was 23.116 seconds / 12,695 SQL statements / 502.1 MiB peak RSS; the final fixture has lower full wall time and query count with slightly higher worker RSS. This is a descriptive comparison: the same WSL2 host reported 4.69 GiB visible memory vs 5.65 GiB originally, with higher initial load, and OS caches were not flushed. Container limits and pinned tools are unchanged. No uniform or production-library speedup is established.

Unchanged full rescans increased from 0.215 to 1.288 seconds and unchanged discovery from 0.220 to 1.293 seconds. The new paths persist discovery/cursor/run checkpoints and independent outcomes; that work was absent in the old helpers. Same-size changes now reprocess one changed file; the old baseline processed zero and retained stale derived output, so its faster result is not equivalent work. All unsupported files reach independent terminal states. SQL durations are millisecond-resolution sums under concurrency, and a lower statement count does not guarantee lower summed SQL time.

The fixture includes 500 unsupported text files, so its throughput is not photo/video throughput. Short rescan p95 values have only 10–13 samples per endpoint/run. Small synthetic fixtures and warm local storage do not establish large-library, slow-storage or production capacity. The 120-second result covers dispatch/drain on these fixtures; scheduler cadence is tested separately. Use the retained benchmark output and a representative deployment workload before selecting a latency or capacity objective.
