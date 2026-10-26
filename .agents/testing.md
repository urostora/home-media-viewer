# Testing and validation

Paths below are relative to `home-media-viewer/` unless stated otherwise. Read [Docker execution](docker-execution-guidelines.md) before running checks.

## Choose validation for the change

- Start with relevant tests under `__tests__/`; use `*.test.ts` or `*.test.tsx` and existing `*.helper.ts` modules.
- Component tests use React Testing Library and MSW. API/browser tests under `__tests__/web/` require a running application, administrator, fixture database, and media.
- `jest.config.mjs` uses `next/jest`, jsdom, and the `jest-puppeteer` preset; even focused runs may invoke Chromium setup. Inspect `jest-puppeteer.config.cjs` when diagnosing startup failures.
- Use lint, `npm run typecheck`, and build checks as appropriate to changed code. `npm test` adds coverage; use focused Jest runs when full coverage collection is unnecessary.
- Documentation-only changes generally need link, reference, and diff checks rather than application builds or tests.

## Integration environments

- Development Compose bind-mounts the working tree. Test Compose images copy source at build time; rebuild affected images after edits.
- For disposable validation of a committed revision, use the root [build/test workflow](../scripts/build/README.md). It isolates credentials, ports, images, and volumes and handles setup and cleanup. It does not test uncommitted edits.
- For uncommitted integration changes, use a dedicated Compose project and private task environment, unique image tags, and nonconflicting host ports (or a port-removing override). A project name alone does not isolate explicit image tags or published ports.
- Fresh test environments need this sequence: build images; start and wait for `db`; apply migrations; explicitly seed the administrator; start `app` and `background`; initialize fixtures; run tests. Stop on any setup failure.
- Inspect root `scripts/test/initTestData.sh` and `scripts/test/initTestData.mjs` before initialization: they create albums/users and process media. In the test runner, initialization is `bash ./scripts/initTestData.sh`; the development runner mounts the scripts at `/home/node/scripts/`.
