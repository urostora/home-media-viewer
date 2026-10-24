# Committed releases and disposable tests

Run from any directory with Python 3.9+, Git, Docker and Docker Compose >=2.24.4 (test port removal uses `!reset`). Commands build only **committed** content from the selected local repository. Commit the infrastructure changes before selecting a normal release revision. Fetch private refs beforehand using Git's configured SSH agent or credential helper; do not put credentials in URLs. No clone, fetch, checkout replacement, push or deployment occurs automatically.

```sh
# From the repository root; choose a locally available commit, tag or branch.
bash scripts/build/production/build-prod.sh --ref HEAD --manifest /protected/releases/hmv-release.json
# Optional: --repository /absolute/checkout --image-prefix registry.example.com/team/hmv
bash scripts/build/test/build-test.sh --ref HEAD
```

Each command creates a detached temporary worktree and a random Compose project. It uses the selected revision's Compose definitions and temporary generated credentials; it accepts no caller environment file. Caller database URLs, Compose settings, release image variables and passwords cannot override fixture settings. Docker connection/configuration variables are retained. Test web/database ports are removed, test container names are project-scoped, and volumes are newly allocated. Existing databases, media and worktrees are preserved. Builds within a repository are serialized with a nonblocking lock on the Git common directory.

Production builds use `docker-compose-prod.yml`, building `app` and `migration`. Background and scheduler reuse the exact app image with their own runtime configuration. Temporary image names are unique. Only after both builds succeed and their OCI revision labels match the resolved full commit are their inspected image IDs tagged as `<prefix>/app:git-<full-commit>` and `<prefix>/migration:git-<full-commit>`. Existing release tags and manifest paths are rejected rather than overwritten. A new JSON manifest records the revision, all service references and the two local image IDs. Keep it with the release. Serialize publication to the same image namespace across separate repository clones. Docker tags can still be changed by external tools; configure registry immutability if publishing, and record registry digests for deployment across hosts (local image IDs are not registry digests).

Release output is intentional: immutable image tags and the manifest remain. Temporary tags, worktrees and settings are removed on success/failure/interruption; disposable test containers, networks and volumes are removed too. Errors propagate as nonzero exits. Cleanup errors identify the disposable project and fail the command. Do not kill the process with SIGKILL if cleanup is required; after a host/process crash inspect `hmv-build-*` labels before removing orphaned resources.

The test command builds the app, migration and test runner, starts only the fresh DB, applies migrations and explicitly seeds its generated administrator, then starts app/background. It waits for service readiness, initializes fixtures and runs the existing Jest suite. Every setup command must succeed before the next phase; it never runs `migrate reset` or clears existing thumbnail storage. Fixture setup rejects transport/HTTP/API/login errors immediately and keeps cookies in process memory. A failed test/setup never prints `Tests passed`.

## Deploying a completed release

Use the manifest's app reference for `HMV_APP_IMAGE` (web/background/scheduler) and migration reference for `HMV_MIGRATION_IMAGE`. Set both in the private production environment file or export them together. All services must use the same manifest. Keep the previous manifest/images for deliberate rollback; database compatibility may require restoring a backup.

Take a verified backup and follow the security/credential transition runbook first. For an existing installation, using the exact deployment project and its private environment:

```sh
# Set both HMV_*_IMAGE variables to the references from the release manifest first.
set -e
docker compose -f docker-compose-prod.yml --env-file .env-prod stop scheduler app background
docker compose -f docker-compose-prod.yml --env-file .env-prod run --rm --no-build --pull never migration
# For a first installation only, explicitly bootstrap the administrator:
# docker compose -f docker-compose-prod.yml --env-file .env-prod run --rm --no-build --pull never migration npx --no-install prisma db seed
docker compose -f docker-compose-prod.yml --env-file .env-prod up -d --no-build --pull never app background scheduler
```

Run these against the release revision's Compose/configuration files. A missing image must fail rather than silently build/pull a mutable default. These scripts do not deploy or publish artifacts. Release build acceptance verifies artifact identity; it does not replace application smoke tests or the integration suite. Dependency locking and image packaging changes remain infrastructure review point 7.

## Focused orchestration regression checks

```sh
docker compose run --rm --no-deps -v "$PWD:/workspace:ro" dependencies python3 /workspace/docker/test/release.test.py
docker compose run --rm --no-deps -v "$PWD:/workspace:ro" dependencies node --test /workspace/docker/test/fixture-init.test.mjs
```

These check successful artifact identity with no existing images, refused tag overwrites, build/setup/fixture failure gating, caller-environment isolation, initialization order and cleanup. They mock orchestration commands or HTTP responses and do not reset an application database. The point 6 live test run passed migration/seed/startup/fixture setup but its application suite was blocked in Node 26 Puppeteer/yargs global setup (`require is not defined in ES module scope`); see infrastructure review point 7.
