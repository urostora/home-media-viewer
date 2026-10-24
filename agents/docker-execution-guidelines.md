# Docker Execution Guidelines

Run application, dependency, build, lint, test, and Prisma commands inside Docker. Run the following Compose commands from the repository root. File inspection, editing, and Git commands can run on the host.

- Use the project Compose files for installs, tests, builds, and service startup.
- Prefer the matching test Compose file for test runs.
- Use Compose service names for database and Prisma access instead of localhost.
- Do not run host-level npm, Jest, Prisma, or app startup commands.
- Keep commands aligned with the project’s deployed container layout, not a local host setup.

## Development commands

The default `docker-compose.yml` provides `dependencies`, `db`, `app`, and `testrunner`. The Node services use `/home/node/app` as their working directory and bind-mount `home-media-viewer/`.

```sh
docker compose run --rm dependencies npm install
docker compose run --rm dependencies npx prisma generate
docker compose up -d app
docker compose run --rm dependencies npm run lint
docker compose run --rm dependencies npm run build
docker compose run --rm testrunner npx jest --runInBand --runTestsByPath __tests__/components/albumDetails.test.tsx
docker compose run --rm testrunner npm test -- --runInBand
```

These install dependencies, generate Prisma's client, start development, lint, build, and run focused or full tests respectively. Check the configured host port in Compose rather than assuming a fixed port.

## Test environment

Use both the test Compose file and its environment file consistently:

```sh
docker compose -f docker-compose-test.yml --env-file .env-test build
docker compose -f docker-compose-test.yml --env-file .env-test up -d db app background
docker compose -f docker-compose-test.yml --env-file .env-test run --rm testrunner npm test -- --runInBand
```

Test images copy source at build time; rebuild affected images after source changes. Development bind mounts reflect edits directly. API/browser tests need a prepared fixture database and test media; inspect the README and `scripts/test/initTestData.sh` before initialization because it changes application data.

Use `db` for database connections inside Compose and service names such as `app` or `background` for new internal HTTP configuration. Preserve existing environment-specific URLs unless changing that configuration is part of the task. Check the selected environment before running migrations; database resets and volume deletion require explicit task authorization.
