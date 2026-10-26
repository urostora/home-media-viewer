# Docker execution

Run Compose commands from the repository root. Use `db` for database connections inside Compose and `app` or `background` for new internal HTTP configuration; preserve existing environment-specific URLs.

## Existing development environment

These commands use the default development project and its configured environment. They may modify shared dependencies or start existing services; use them when working in that environment, not as disposable validation setup.

```sh
docker compose run --rm dependencies npm ci
docker compose run --rm dependencies npx prisma generate
docker compose up -d app
docker compose run --rm dependencies npm run lint
docker compose run --rm dependencies npm run typecheck
docker compose run --rm dependencies npm run build
docker compose run --rm testrunner npx jest --runInBand --runTestsByPath __tests__/components/albumDetails.test.tsx
```

Node services work in `/home/node/app` with the application bind-mounted. Check configured ports rather than assuming defaults. The test runner depends on `app`; running it may start the database and migration service too.

## Disposable validation

Select setup using [testing](testing.md). Use `docker-compose-test.yml` for the packaged integration environment. For manual runs, consistently pass `-p <task-project>`, the selected Compose files/overrides, and `--env-file <task-env>` to every command. Verify database URLs target the task's `db` before migrations or fixture setup.

For committed revisions, prefer the existing [build/test workflow](../scripts/build/README.md) over duplicating its orchestration. For working-tree runs, follow the fresh-environment sequence in the testing guide; simply starting services and invoking Jest does not prepare fixtures.

## Cleanup mechanics

- Verify task ownership through project labels/names and confirm disposable volumes are not attached to shared containers.
- For a verified task-only project, use the exact project/files/environment with `down --volumes --remove-orphans` before deleting temporary configuration. This cleanup is authorized for task-created disposable volumes.
- Remove task-only image tags and temporary files, including private environment files, certificates, fixture copies, and backup sets.
- Never use broad Docker pruning or remove shared development/production resources as task cleanup.
