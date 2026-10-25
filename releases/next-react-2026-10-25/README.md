# Next.js / React release handoff

Prepared 2026-10-25. **Release artifacts are local; nothing has been deployed or pushed.**

| Artifact | Source | Purpose |
| --- | --- | --- |
| [release.json](release.json) | `4c70b966440414952d479f7cad30517ad2f4aa84` | Next 16.4.3 / React 19.3.1 / session 9.0.1 candidate; same application source that passed 118 tests in Step 6 |
| [rollback.json](rollback.json) | `2d10888150179c7b13d671c728c58065b1dd4b5f` | Validated pre-Next-16 checkpoint: Next 15.5.28 / React 19.3.1 / session 6.3.1; Step 4 passed 115 tests |
| [acceptance.json](acceptance.json) | Both revisions | Image/validation handoff, schema equality, cookie compatibility and remaining deployment gates |

Each manifest records revision-specific app and migration tags and their inspected local image IDs. Background and scheduler use that manifest's app image. Both image pairs are intentionally retained in the local Docker daemon. Do not overwrite their tags or mix roles from different manifests. Existing images were preserved. The local tags/IDs are not registry digests; moving to another Docker host requires transferring the images and verifying destination identities, or explicitly publishing and recording registry digests.

The rollback candidate is **not evidence of what is currently deployed on another host**. Before deployment, inventory the actual production images/manifest and retain those as well. Select the operational rollback target deliberately. The supplied checkpoint has the identical Prisma schema/migration tree and base-image configuration, and its native checks pass, but its older standalone trace includes TypeScript. It fails the new release's no-compiler packaging assertion; this is a recorded baseline limitation, not a change to the new release's acceptance criteria.

## Session compatibility

A Node 26 probe exercised actual `getIronSession(...).save()` / session reads with the pinned versions 6.3.1 and 9.0.1, using generated credentials. Both versions read each other's current format-2 cookies with the same password. A legacy format-1 envelope readable by v6 is rejected by v9. The earlier plan's blanket forced-sign-in statement was incorrect for the pinned v6.3.1 format and is corrected by this evidence. Keep the cookie name, secret and flags unchanged. Expired, legacy or otherwise rejected cookies require signing in again; do not rotate secrets solely for this upgrade.

## Before deployment — operator gates

- [ ] Obtain separate deployment authorization; confirm the existing Compose project, production host and private environment file.
- [ ] Inventory and retain the actual deployed release manifest and images. Verify both candidate manifests against image IDs and revision labels, as below.
- [ ] Follow the [database lifecycle inventory](../../docs/database-lifecycle.md) and [backup/restore guide](../../scripts/backup/README.md); verify a restorable backup. Keep the same database image, credentials, volumes, media bind mounts and storage paths. The two candidate revisions have identical Prisma trees, but verify the actual production migration state before proceeding.
- [ ] Use the release revision's Compose definitions and the deployment's existing overrides. Confirm `SESSION_COOKIE_SECURE=true` behind the normal HTTPS ingress and keep `APP_SESSION_SECRET` unchanged.
- [ ] Review 31 recorded lint warnings and Linux amd64 validation scope. Do not initialize test fixtures in production.

Verify local artifacts without displaying private settings, from this handoff directory:

```bash
python3 - <<'CHECK'
import json, subprocess
from pathlib import Path
for path in [Path('release.json'), Path('rollback.json')]:
    manifest = json.loads(path.read_text())
    assert manifest['app'] == manifest['background'] == manifest['scheduler']
    for role in ['app', 'migration']:
        image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', manifest[role]]))[0]
        assert image['Id'] == manifest['image_ids'][role], (path.name, role, 'identity mismatch')
        assert image['Config']['Labels']['org.opencontainers.image.revision'] == manifest['revision']
    print(path.name, 'verified')
CHECK
```

## Deployment sequence — prepared, not executed

Use the existing deployment checkout/configuration and explicit existing project. Replace the example variables with inspected deployment values; preserve every existing override in the Compose command array. Exporting image references overrides the private environment file without editing or printing it.

```bash
set -e
HMV_PROJECT='REPLACE_WITH_EXISTING_PROJECT'
HMV_ENV_FILE='/secure/hmv.env'
HMV_DEPLOY_DIR='/path/to/existing/deployment'
export HMV_APP_IMAGE='hmv-releases/app:git-4c70b966440414952d479f7cad30517ad2f4aa84'
export HMV_MIGRATION_IMAGE='hmv-releases/migration:git-4c70b966440414952d479f7cad30517ad2f4aa84'
HMV_COMPOSE=(docker compose -p "$HMV_PROJECT" --env-file "$HMV_ENV_FILE" -f "$HMV_DEPLOY_DIR/docker-compose-prod.yml")
# Append the deployment's existing override files before continuing, if any.
"${HMV_COMPOSE[@]}" config --quiet
"${HMV_COMPOSE[@]}" stop scheduler app background
"${HMV_COMPOSE[@]}" run --rm --no-deps --pull never migration
"${HMV_COMPOSE[@]}" up -d --no-build --pull never app background scheduler
```

The image identity preflight above must pass **before stopping services**. Do not seed an existing production database, run migrate reset, perform a volume-deleting teardown, or change MariaDB for this framework release.

## Deployment acceptance — pending authorization

- [ ] App and background live/ready health endpoints return 200; readiness uses no-store and container health becomes healthy.
- [ ] Sign in through the normal HTTPS hostname; protected APIs accept the valid session and reject absent/tampered sessions. Check guest/admin restrictions and logout; confirm browser cookie flags.
- [ ] Browse existing albums and nested paths, navigate/search/filter, open location maps and inspect metadata without React errors.
- [ ] Load authenticated thumbnails and play an existing video with HTTP range delivery; verify static/public assets.
- [ ] Confirm background processing succeeds with the existing bearer token and scheduler requests remain serial; inspect durable processing status and bounded logs.
- [ ] Record host, time, manifest, health/smoke results and operator acceptance. Retain rollback artifacts until acceptance and the agreed retention period finish.

Roll back if health does not recover, authorization changes unexpectedly, media fails or background processing regresses. Do not treat passing pre-release tests as live deployment acceptance.

## Rollback sequence — prepared, not executed

Use the same project, environment, mount mappings and Compose overrides. Verify the previous manifest image IDs/labels before stopping any services, then restore **both** image references from the selected previous manifest. For the supplied pre-Next-16 candidate:

```bash
# Run the manifest identity preflight above before stopping services.
export HMV_APP_IMAGE='hmv-releases/app:git-2d10888150179c7b13d671c728c58065b1dd4b5f'
export HMV_MIGRATION_IMAGE='hmv-releases/migration:git-2d10888150179c7b13d671c728c58065b1dd4b5f'
"${HMV_COMPOSE[@]}" stop scheduler app background
"${HMV_COMPOSE[@]}" config --quiet
"${HMV_COMPOSE[@]}" run --rm --no-deps --pull never migration
"${HMV_COMPOSE[@]}" up -d --no-build --pull never app background scheduler
```

For these two revisions, migration deploy is a no-op on an up-to-date schema: schema and migration files are identical. There is no down migration and no automatic database restore. If another release changed the production schema, reassess compatibility before rollback; use the documented recovery workflow when a restore is required. Repeat the same live acceptance checks after rollback. Current cookies were tested compatible in both directions; an unreadable/expired cookie should return the user to sign-in.

See [nuxt-update.md](../../nuxt-update.md) for all execution evidence. This handoff is an intentional deliverable; its manifests and four release/rollback image tags survive task cleanup.
