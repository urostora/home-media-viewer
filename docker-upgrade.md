# Docker Compose & Build Process – Upgrade Recommendations

Reviewed: 2026-10-11
Scope: `docker-compose.yml`, `docker-compose-test.yml`, `docker-compose-prod.yml`, all Dockerfiles under `docker/`, `.env*` files, `package.json`, `jest-puppeteer.config.cjs`.

---

## ✅ Completed Tasks

| # | Priority | Task | Status | Date |
|---|----------|------|--------|------|
| 2.1 | 🔴 Critical | Fix prod compose mounting `./test/files` | ✅ Completed | - |
| 2.2 | 🔴 Critical | Remove `user: "0"` from prod background | ✅ Completed | 2026-10-11 |
| 2.3 | 🔴 Critical | Fix `--chmod=775` / `--chmod=0777` | ✅ Completed | 2026-10-11 |
| 2.4 | 🔴 Critical | Fix `BACKGROND_URL` → `BACKGROUND_URL` | ✅ Completed | 2026-10-11 |

---

## 1. Image Version Consistency

| Image | Usage | Status |
|---|---|---|
| `node:24` | All 7 Dockerfiles (dev, test, prod) | ✅ Consistent across all files |
| `mariadb:13` | All 3 compose files | ✅ Consistent across all files |

Both are **floating tags** (no minor version pinned). This means a `docker pull` at any time may pull a different minor/patch release, leading to non-reproducible builds.

### Recommendations

- **Pin to a specific minor version** for reproducibility:
  - `node:24` → `node:24.x` (or `node:24.0.0` for exact pin)
  - `mariadb:13` → `mariadb:13.x` (or `mariadb:13.0.0`)
- **Use a build `ARG`** for the Node version so it can be overridden without editing every Dockerfile:
  ```dockerfile
  ARG NODE_VERSION=24
  FROM node:${NODE_VERSION}
  ```
- **`@types/node` mismatch** – `package.json` declares `"@types/node": "^18.15.3"` but the runtime is Node 24. This means TypeScript type-checking uses Node 18 typings while the code runs on Node 24. Update to:
  ```json
  "@types/node": "^24.0.0"
  ```
- **`eslint-config-next` mismatch** – `package.json` has `"eslint-config-next": "13.2.4"` but `next` is `^14`. Align to `"eslint-config-next": "^14"`.

---

## 2. Critical Issues

### 2.1 Production compose mounts test files as album root

`docker-compose-prod.yml` mounts `./test/files` as `${APP_ALBUM_ROOT_PATH}` for both `app` and `background` services:

```yaml
volumes:
  - ./test/files:${APP_ALBUM_ROOT_PATH}:ro
```

This is almost certainly a copy-paste from the test compose. Production should mount the real media directory. **Fix:** replace with the actual production media path (e.g. `./media` or a host path from `.env`).

### 2.2 `user: "0"` (root) in production

`docker-compose-prod.yml` explicitly sets `user: "0"` on the `background` service. The prod app Dockerfile already ends with `USER root`, so this is redundant, but running the background process as root in production is a security risk.

**Fix:** remove `user: "0"` from the compose file and change the Dockerfile to run the app as the `node` user (the default in the `node:24` image). Only the cron daemon needs root; the app process itself should run as `node`.

### 2.3 Insecure file permissions in Dockerfiles

| File | Line | Issue |
|---|---|---|
| `docker/prod/app/Dockerfile` | `COPY --chown=node:node --chmod=775 ./home-media-viewer ./` | World-writable (`775`) on the entire app directory |
| `docker/test/app/Dockerfile` | `COPY --chmod=0777 ./home-media-viewer/runBackgroundProcess.sh` | World-writable script (`0777`) |

**Fix:** use `--chmod=755` for directories and `--chmod=755` for the script. The `node` user owns the files, so others only need read/execute.

### 2.4 `BACKGROUND_URL` typo (FIXED)

The environment variable is correctly named `BACKGROUND_URL` (with two 'O's) in both `docker-compose.yml` and `docker-compose-test.yml`. This variable is properly used in:
- `docker-compose.yml` (line 88): `BACKGROUND_URL: http://media-viewer-dev-app:3000`
- `docker-compose-test.yml` (line 61): `BACKGROUND_URL: http://home-media-viewer-test-background:3000`
- `scripts/test/initTestData.sh` (lines 52-54): `curl -S ${BACKGROUND_URL}/api/process/updateMetadata?token=${PROCESS_TOKEN}`

**Status:** ✅ Fixed - No changes needed.

---

## 3. High-Priority Improvements

### 3.1 No health checks on MariaDB

`depends_on` only waits for the container to **start**, not for MariaDB to be **ready**. The app can attempt to connect before the database accepts connections, causing startup failures.

**Fix:** add a health check to the `db` service in all three compose files:

```yaml
db:
  # ...existing config...
  healthcheck:
    test: ["CMD", "mariadb-admin", "ping", "-h", "localhost", "-u", "root", "-p${MARIADB_ROOT_PASSWORD}"]
    interval: 5s
    timeout: 3s
    retries: 10
    start_period: 10s
```

Then use the long-form `depends_on` with condition:

```yaml
app:
  depends_on:
    db:
      condition: service_healthy
```

### 3.2 No `.dockerignore` for main builds

Only `docker/test/testrunner/.dockerignore` exists. All other builds use `context: .` (project root) with **no** `.dockerignore`, so the entire workspace—including `node_modules/`, `.next/`, `coverage/`, `test/files/`, and `.env*` files—is sent to the Docker daemon on every build.

**Fix:** add a `.dockerignore` at the project root:

```
node_modules
home-media-viewer/node_modules
home-media-viewer/.next
coverage
test/files
.env
.env-test
.env-prod
.env-prod-debug
*.md
.git
```

This will dramatically reduce build context size and speed up builds.

### 3.3 `version: "3"` is deprecated

Docker Compose v2 ignores the top-level `version` field. It has been deprecated since Compose v2.0 (2021).

**Fix:** remove the `version: "3"` line from all three compose files.

### 3.4 `deploy.resources.limits` not honored

The `deploy.resources.limits` block (CPU/memory limits) is only enforced in **Swarm mode** or with `docker compose --compatibility`. In a regular `docker compose up`, these limits are silently ignored.

**Fix:** use the top-level `mem_limit` and `cpus` keys instead:

```yaml
db:
  # ...
  mem_limit: 800m
  cpus: 1.5
```

Or remove them if the limits are not actually needed.

### 3.5 No restart policies

No service has a `restart` policy. If a container crashes, it stays down.

**Fix:** add `restart: unless-stopped` to all services (or `restart: on-failure` for one-shot services like `migration`).

### 3.6 `npm install` without `--frozen-lockfile`

Production builds should use `--frozen-lockfile` to ensure the exact versions from `package-lock.json` are installed, preventing unexpected dependency changes.

**Fix in `docker/prod/app/Dockerfile`:**
```dockerfile
RUN npm install --frozen-lockfile --omit=dev
```

---

## 4. Medium-Priority Improvements

### 4.1 `HOSTNAME` environment variable conflict

Setting `HOSTNAME` in a container's environment is unusual—Docker already sets it to the container ID. In `.env` it's empty (`HOSTNAME=`), which means the variable is set to an empty string, potentially overriding the container's hostname.

**Fix:** remove `HOSTNAME` from the compose files and `.env` files unless it serves a specific purpose. If the app needs a hostname, use a different variable name (e.g. `APP_HOSTNAME`).

### 4.2 `env >> /etc/environment` hack

Both the dev and prod app Dockerfiles use:
```dockerfile
CMD env >> /etc/environment && service cron start && npm start
```
This dumps all environment variables into `/etc/environment` on every container start. It's a side-effect hack that can cause unexpected behavior and makes the container harder to debug.

**Fix:** remove the `env >> /etc/environment` prefix. Environment variables set via `docker compose` are already available to the process.

### 4.3 `headless: 'new'` is deprecated

`jest-puppeteer.config.cjs` uses `headless: 'new'`. In Chrome 112+, the old headless mode was removed and `headless: 'new'` is equivalent to `headless: true`. The `'new'` string is deprecated.

**Fix:** change to `headless: true`.

### 4.4 Puppeteer downloads unused Chromium

`puppeteer: ^21.5.1` downloads its own Chromium binary during `npm install`, but the testrunner images install `google-chrome-stable` separately and configure Puppeteer to use it via `executablePath`. The bundled Chromium is wasted disk space (~150 MB).

**Fix:** set `PUPPETEER_SKIP_DOWNLOAD=true` (or `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`) in the testrunner Dockerfiles:
```dockerfile
ENV PUPPETEER_SKIP_DOWNLOAD=true
```

### 4.5 Dev `DATABASE_URL` uses root user

`.env` (dev) connects to MariaDB as `root`:
```
DATABASE_URL=mysql://root:${MARIADB_ROOT_PASSWORD}@db:3306/${MARIADB_DATABASE}
```
While `.env-test` and `.env-prod` use the dedicated `appuser`. Even in dev, using the root user for the app is a bad habit.

**Fix:** change the dev `DATABASE_URL` to use `${MARIADB_USER}` and `${MARIADB_PASSWORD}` like the other environments.

### 4.6 No `HEALTHCHECK` in app Dockerfiles

The app containers have no `HEALTHCHECK` instruction. Adding one allows `docker compose` and orchestrators to detect when the app is actually ready.

**Fix (in `docker/prod/app/Dockerfile`):**
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
```
(Adjust the URL to an actual health endpoint.)

### 4.7 `VOLUME` declarations in app Dockerfiles

`docker/dev/app/Dockerfile` declares:
```dockerfile
VOLUME /mnt/albums
VOLUME /mnt/storage
VOLUME /home/node/app
```
`VOLUME` in a Dockerfile creates an anonymous volume that can interfere with bind mounts and layer caching. Since the compose files already define the volumes, these declarations are unnecessary.

**Fix:** remove the `VOLUME` lines from the Dockerfiles.

---

## 5. Low-Priority / Hygiene

### 5.1 `apt` cleanup in dev app Dockerfile

`docker/dev/app/Dockerfile` installs `cron` but doesn't clean up apt lists:
```dockerfile
RUN apt update && apt -y install cron
```
**Fix:**
```dockerfile
RUN apt update \
    && apt -y install --no-install-recommends cron \
    && rm -rf /var/lib/apt/lists/*
```

### 5.2 `TS_NODE_PROJECT` in production

The prod compose files set `TS_NODE_PROJECT` but the production app doesn't use `ts-node` (the background process makes an HTTP call, not a `ts-node` invocation). This env var is dead weight.

**Fix:** remove `TS_NODE_PROJECT` from `docker-compose-prod.yml`.

### 5.3 `container_name` and `hostname` redundancy

Every service sets both `container_name` and `hostname` to the same value. `container_name` sets the Docker container name; `hostname` sets the OS hostname inside the container. They serve different purposes but using the same value is redundant.

**Fix:** keep `container_name` for operational clarity. Remove `hostname` unless the app specifically reads `hostname` for network discovery (in which case, the compose service name already handles this via DNS).

### 5.4 No log configuration

No service configures a log driver or log rotation. Default `json-file` logging can grow unbounded.

**Fix (optional):** add a top-level `logging` section:
```yaml
services:
  app:
    # ...
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

### 5.5 `MARIADB_AUTO_UPGRADE: 1`

This is set in all three compose files. It's useful for dev/test but in production, automatic schema upgrades can be risky. Consider removing it from `docker-compose-prod.yml` and relying on explicit migration steps.

### 5.6 `stop_grace_period`

No service defines a `stop_grace_period`. The default is 10 seconds, which may not be enough for the Next.js app to finish in-flight requests.

**Fix (optional):** add `stop_grace_period: 30s` to the `app` and `background` services.

---

## 6. Summary of Changes by Priority

| # | Priority | Change | Files |
|---|---|---|---|
| 1 | 🔴 Critical | Fix prod compose mounting `./test/files` | `docker-compose-prod.yml` |
| 2 | 🔴 Critical | Remove `user: "0"` from prod background | `docker-compose-prod.yml` |
| 3 | 🔴 Critical | Fix `--chmod=775` / `--chmod=0777` | `docker/prod/app/Dockerfile`, `docker/test/app/Dockerfile` |
| 4 | 🔴 Critical | Fix `BACKGROND_URL` → `BACKGROUND_URL` | `docker-compose.yml`, `docker-compose-test.yml` |
| 5 | 🟠 High | Pin image versions (`node:24.x`, `mariadb:13.x`) | All Dockerfiles, all compose files |
| 6 | 🟠 High | Update `@types/node` to `^24` | `package.json` |
| 7 | 🟠 High | Add MariaDB healthcheck + `depends_on` condition | All compose files |
| 8 | 🟠 High | Add root `.dockerignore` | project root |
| 9 | 🟠 High | Remove `version: "3"` | All compose files |
| 10 | 🟠 High | Replace `deploy.resources.limits` with `mem_limit`/`cpus` | `docker-compose.yml` |
| 11 | 🟠 High | Add `restart: unless-stopped` | All compose files |
| 12 | 🟠 High | Use `npm install --frozen-lockfile` in prod | `docker/prod/app/Dockerfile` |
| 13 | 🟡 Medium | Remove `HOSTNAME` env var | compose files, `.env*` |
| 14 | 🟡 Medium | Remove `env >> /etc/environment` | `docker/dev/app/Dockerfile`, `docker/prod/app/Dockerfile` |
| 15 | 🟡 Medium | `headless: 'new'` → `headless: true` | `jest-puppeteer.config.cjs` |
| 16 | 🟡 Medium | Set `PUPPETEER_SKIP_DOWNLOAD=true` | testrunner Dockerfiles |
| 17 | 🟡 Medium | Use `appuser` in dev `DATABASE_URL` | `.env` |
| 18 | 🟡 Medium | Add `HEALTHCHECK` to app Dockerfiles | `docker/prod/app/Dockerfile` |
| 19 | 🟡 Medium | Remove `VOLUME` from app Dockerfiles | `docker/dev/app/Dockerfile`, `docker/test/app/Dockerfile` |
| 20 | 🟢 Low | Clean up `apt` in dev Dockerfile | `docker/dev/app/Dockerfile` |
| 21 | 🟢 Low | Remove `TS_NODE_PROJECT` from prod | `docker-compose-prod.yml` |
| 22 | 🟢 Low | Remove redundant `hostname` | All compose files |
| 23 | 🟢 Low | Add log rotation config | All compose files |
| 24 | 🟢 Low | Remove `MARIADB_AUTO_UPGRADE` from prod | `docker-compose-prod.yml` |
| 25 | 🟢 Low | Add `stop_grace_period` | All compose files |
