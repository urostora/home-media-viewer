# Next.js and React upgrade plan

Last updated: 2026-10-25. Overall status: **Step 5 complete; repository dependencies are at Next.js 16.4.3 and React/React DOM 19.3.1, with iron-session 9 and flat ESLint. Steps 6–7 remain open.**

The requested filename is retained, but this application uses Next.js Pages Router, React and TypeScript. Upgrade the existing Pages Router application to the latest stable Next.js and React releases. Keep the current routes, API contracts, session behavior and standalone Docker deployment. App Router adoption, React Compiler adoption, database upgrades and unrelated dependency upgrades are separate work.

## Verified starting point and targets

Baseline versions below were recorded from the original `home-media-viewer/package-lock.json`, rather than installed host dependencies. Applied checkpoints are recorded in the Status column and execution records. Target versions were checked against the npm registry's `latest` metadata from a disposable Docker Compose Node container on 2026-10-25.

| Package | Baseline manifest requirement | Baseline locked version | Target | Status |
| --- | --- | --- | --- | --- |
| `next` | `^14` | 14.1.0 | **16.4.3** | Applied in Step 5 |
| `react` | `^18.2.0` | 18.2.0 | **19.3.1** | Applied in Step 4 |
| `react-dom` | `^18.2.0` | 18.2.0 | **19.3.1** | Applied in Step 4 |
| `eslint-config-next` | `14.1.0` | 14.1.0 | 16.4.3, matching Next.js | Applied in Step 5 |
| `@types/react` | `^18.0.28` | 18.2.48 | 19.3.0 | Applied in Step 4 |
| `@types/react-dom` | `18.0.11` | 18.0.11 | 19.3.0 | Applied in Step 4 |
| `@testing-library/react` | `^14.0.0` | 14.1.2 | 16.3.3 | Applied in Step 3 with DOM 10.4.2 to remove the React 18.3 act deprecation |
| `react-leaflet` | `^4.2.1` | 4.2.1 | Remove unused dependency | Removed in Step 4 with Leaflet and its types; source uses Pigeon Maps |

Registry metadata: [Next.js](https://registry.npmjs.org/next/latest), [React](https://registry.npmjs.org/react/latest), [React DOM](https://registry.npmjs.org/react-dom/latest), [Next ESLint configuration](https://registry.npmjs.org/eslint-config-next/latest), [React types](https://registry.npmjs.org/@types%2Freact/latest), [React DOM types](https://registry.npmjs.org/@types%2Freact-dom/latest), [Testing Library](https://registry.npmjs.org/@testing-library%2Freact/latest), [React Leaflet](https://registry.npmjs.org/react-leaflet/latest).

The React documentation currently identifies the 19.3 release family; the live npm registry resolves the newer patch **19.3.1**. Use that exact patch for both React packages. Recheck all targets when implementation begins and record any changes here. Exclude canary, RC and experimental releases. [React versions](https://react.dev/versions)

## Task tracker

Check a task only after recording its evidence. Use **Not started**, **In progress**, **Blocked** (with a concrete reason), or **Done**. Update this table and the relevant checklist after each phase.

| Step | Task | Current status | Completion evidence |
| --- | --- | --- | --- |
| 0 | Inspect repository and verify stable targets | **Done** | Lockfile/configuration inspection and live registry metadata above |
| 1 | Prepare isolated workspace and record baseline | **Done** | Baseline recorded below: builds and 109 tests pass; seven pre-existing TypeScript errors and existing warnings documented |
| 2 | Resolve dependency compatibility and migration choices | **Done** | Strict peer resolution for both checkpoints and final selection; map, lint configuration, session and TypeScript probes recorded below |
| 3 | Establish React 18.3 / Next.js 15 checkpoints | **Done** | Both checkpoints built and tested; Next 15.5.28 / React 18.3.1 applied; 109 tests passed at each checkpoint |
| 4 | Upgrade React and compatible libraries | **Done** | React 19.3.1 / types 19.3.0; strict clean install, lint/typecheck, both builds, 21 suites / 115 tests passed |
| 5 | Upgrade Next.js and migrate build/lint/session configuration | **Done** | Next 16.4.3; typed Node proxy/session; flat ESLint; typecheck and both builds pass; 17 focused tests plus session/image/reload probes |
| 6 | Validate full application and production packaging | Not started | Fresh fixture integration run and final-image smoke results |
| 7 | Prepare release, rollback instructions and cleanup | Not started | Release manifest, acceptance record and cleanup confirmation |

## Step 1 — Prepare isolation and a reproducible baseline

- [x] Preserve the current worktree. Create a dedicated branch/checkpoint and isolated checkout for the upgrade; do not overwrite existing changes. Ensure all intended infrastructure changes are present in that checkout.
- [x] Read `agents/general-guidelines.md`, `agents/docker-execution-guidelines.md` and `agents/nuxt-react-guidelines.md` in order. Read `scripts/build/README.md` before running its release/test workflows.
- [x] Use a unique Compose project and generated private test environment. Remove published ports with a disposable override when running parallel stacks. Keep source media read-only and use fresh task-owned database/storage volumes.
- [x] Run `npm ci` and Prisma generation through the Compose `dependencies` service in the isolated checkout. Record Node/npm versions and the resolved dependency tree.
- [x] Record baseline lint, explicit TypeScript checking, focused component tests, full fixture integration tests and production build results. Classify pre-existing failures before changing dependencies. Do not call existing failures upgrade regressions.

Run from the isolated checkout root with its disposable environment; replace the example project name with the chosen unique name:

```sh
docker compose -p hmv-next-upgrade --env-file /tmp/hmv-next-upgrade.env run --rm --no-deps dependencies npm ci
docker compose -p hmv-next-upgrade --env-file /tmp/hmv-next-upgrade.env run --rm --no-deps dependencies npx --no-install prisma generate
docker compose -p hmv-next-upgrade --env-file /tmp/hmv-next-upgrade.env run --rm --no-deps dependencies npm ls next react react-dom
docker compose -p hmv-next-upgrade --env-file /tmp/hmv-next-upgrade.env run --rm --no-deps dependencies npm run lint
docker compose -p hmv-next-upgrade --env-file /tmp/hmv-next-upgrade.env run --rm --no-deps dependencies npx --no-install tsc --noEmit --incremental false
docker compose -p hmv-next-upgrade --env-file /tmp/hmv-next-upgrade.env run --rm --no-deps dependencies npm run build
```

Development Compose bind-mounts `home-media-viewer/`, so these commands change that checkout's dependencies and generated files. Its build uses `next.config.js`; the production Docker build separately uses `next.config.js.prod`. Validate both.

## Step 2 — Resolve compatibility before installing

- [x] Requery `latest`, engines and peer dependencies with `npm view` through the Docker `dependencies` service; record exact selected versions in this document.
- [x] Confirm the pinned Node 26.12.1 image remains suitable. Next.js 16.4.3 declares Node `>=20.9.0`; no Node image change is required by that constraint. Preserve `docker/base-images.yml` pins during this upgrade.
- [x] Select replacement/removal actions for the React-18-only peers: Testing Library 14.1.2 and React Leaflet 4.2.1 both declare React 18 support only. Select Testing Library 16.3.3 and DOM 10.4.2. Remove unused React Leaflet, Leaflet and Leaflet types during Step 4; source inspection found no imports. No repository packages have been changed in Step 2.
- [x] Check `pigeon-maps` (locked 0.21.3, broad React peer range) with actual rendering tests. Upgrade only if needed. Inspect the location/map components for Leaflet usage before changing their APIs.
- [x] Select a compatible ESLint stack. `eslint-config-next@16.4.3` requires ESLint >=9; the repository has ESLint 8.36.0, TypeScript ESLint 6 and legacy `standard-with-typescript` configuration. Prefer compatible ESLint 9, flat Next/TypeScript/Prettier configuration and supported plugins; replace the legacy preset rather than forcing peer conflicts.
- [x] Choose TypeScript deliberately. Current 5.2.2 needs an explicit compatibility/typecheck assessment. Do not blindly install TypeScript `latest`: the registry reports 7.0.2, while `typescript-eslint@8.72.0` supports TypeScript `<6.1.0`. Keep a supported TypeScript version and document it.
- [x] Assess `iron-session@6` in the request boundary and Pages API handlers. Plan any necessary session-library changes separately from cookie/key changes, and preserve existing sessions where possible.

Acceptance: all selected peers resolve without `--force` or `--legacy-peer-deps`; changes remain limited to the framework upgrade and its prerequisites.

## Step 3 — Establish intermediate checkpoints

- [x] Upgrade React and React DOM together to **18.3.1** while retaining compatible React 18 types and libraries. Run focused tests and exercise the UI; fix actionable deprecation warnings. This is the preparation path recommended by the [React 19 upgrade guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide).
- [x] Move Next.js and `eslint-config-next` to the newest compatible, patched **15.x** release, resolving its exact version from the registry first. Keep React 18.3.1 initially; Pages Router supports React 18 and 19. Review the [Next.js 15 Pages Router upgrade guide](https://nextjs.org/docs/pages/guides/upgrading/version-15).
- [x] Review applicable codemods and inspect their diffs. Do not blindly apply App Router request-API migrations to this Pages Router codebase.
- [x] Run installation, lint, typecheck, focused tests and both build configurations at each checkpoint. Record exact versions and failures before advancing. These are migration checkpoints, not production deployment targets.

## Step 4 — Upgrade React and its peers together

- [x] In one dependency resolution, select exact `react@19.3.1`, `react-dom@19.3.1`, and React 19 type packages; retain the Testing Library 16.3.3 and DOM 10.4.2 versions applied in Step 3. Remove the unused `react-leaflet`, `leaflet` and `@types/leaflet` dependencies. Update manifest and lockfile together through Docker. Run a clean `npm ci` afterward.
- [x] Review React 19 codemods, including TypeScript migrations, before applying them. Replace global `JSX.Element` annotations with supported scoped types such as imported `JSX` or `React.JSX`; many components and `_app.tsx`/`_document.tsx` currently use the global namespace.
- [x] Fix actual type errors involving refs, element props and component children. Audit removed React DOM APIs and test `act` imports in source and dependencies. Confirm Next/Jest use the modern JSX transform.
- [x] Replace the fragment directly under the Pigeon Map in `contentFilter.tsx` with a local map-center component that does not forward injected props, as verified in Step 2; add focused regression coverage.
- [x] Validate Strict Mode effects, async test assertions, hydration, page navigation and location maps. Preserve existing behavior rather than masking warnings or weakening assertions. [React 19 migration details](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)

Acceptance: compatible dependency tree, passing focused tests and typecheck, no newly introduced React warnings, matching React/React DOM patches.

## Step 5 — Upgrade Next.js and migrate configuration

- [x] Install exact Next.js **16.4.3** and matching `eslint-config-next`, with the compatible lint stack chosen in step 2. Review both the [Pages Router 16 guide](https://nextjs.org/docs/pages/guides/upgrading/version-16) and [16.4.3 release notes](https://github.com/vercel/next.js/releases/tag/v16.4.3).
- [x] Replace `next lint` with an ESLint CLI script covering `src` and `__tests__`, including TSX. Remove obsolete `eslint` configuration from both Next configuration files and add explicit lint execution to release/CI validation.
- [x] Make the bundler choice explicit. Initially use `next dev --webpack` and `next build --webpack` to preserve the existing development polling customization. Test bind-mount reload behavior. Evaluate Turbopack in a separate change after parity is established.
- [x] Migrate `src/middleware.ts` to `src/proxy.ts` using the selected iron-session 9.0.1 Node adapter and typed session helper (Step 2 decision below). Proxy runs on Node, so a filename/export rename alone does not establish session compatibility. Validate the selected Node/session migration; keep the current Edge/session implementation only for the intermediate Next.js 15 checkpoint. Preserve the API matcher and exemptions for login, processing and health endpoints. [Runtime migration guidance](https://nextjs.org/docs/app/guides/upgrading/version-16#middleware-to-proxy)
- [x] Verify authorization in API handlers, unauthorized responses, logout, expired/tampered cookies, and secure-cookie behavior. Update regression tests that inspect middleware filenames/exports if the boundary changes.
- [x] Review `next/image` behavior using actual `/api/file/thumbnail/...` requests. Check supported qualities, cache freshness and authenticated image delivery. Make only required configuration changes; do not broadly loosen image restrictions.
- [x] Preserve standalone output in `next.config.js.prod`. Both configurations currently set `typescript.ignoreBuildErrors: true`; resolve errors and remove this bypass, or enforce a separate required typecheck gate before treating the upgrade as complete.
- [x] Regenerate framework-generated TypeScript files only through Docker; inspect changes to `next-env.d.ts` and `tsconfig.json`. Keep the Pages API routes and `next/router` navigation model.

Acceptance: reproducible clean install, successful lint/typecheck and development/production builds, working request boundary, no invalid Next configuration warnings.

## Step 6 — Validate application behavior and final images

- [ ] Run focused component/utility tests first, including `__tests__/components/albumDetails.test.tsx` and `pathnavigator.test.tsx`. Ensure the Puppeteer Jest preset has its required isolated app/browser environment.
- [ ] Run full API/browser/Jest validation against a fresh migrated/seeded fixture database. Cover correct/incorrect login, protected APIs, users/albums/search, catch-all browsing/navigation, thumbnails, media playback, metadata/maps and background processing.
- [ ] Build app, migration and test-runner images from the updated lockfile. Validate startup with the production configuration, static/public assets, generated Prisma client, bcrypt and FFmpeg/ffprobe.
- [ ] Run `docker/test/runtime-image.test.mjs` inside the final non-root app image and the applicable security, scheduler and graceful-shutdown checks. Verify live/ready health endpoints and background/scheduler startup.
- [ ] Inspect standalone tracing for missing runtime dependencies and stale explicit Docker COPY paths. Compare build output and startup behavior with the baseline.
- [ ] Record command, revision, versions, result and any remaining failures here. Add targeted regression tests for behavior changed during migration.

After the implementation has a selected committed revision, use the repository's isolated workflow:

```sh
bash scripts/build/test/build-test.sh --ref <upgrade-commit>
bash scripts/build/production/build-prod.sh --ref <upgrade-commit> --manifest /protected/releases/hmv-next-upgrade.json
```

These wrappers validate committed content, not uncommitted edits. The test runner provisions disposable fixture resources; the production wrapper creates release images/manifest but does not deploy. Use `scripts/build/README.md` for final-image test invocation and deployment context. Never initialize fixtures against a shared database.

## Step 7 — Release preparation, rollback and cleanup

- [ ] Update this plan, dependency/build documentation and affected command examples with final versions and measured results.
- [ ] Retain the previous release images and manifest. Prepare rollback by restoring the previous app/background/scheduler and migration image references together. This framework upgrade should introduce no database schema changes; verify schema compatibility before any deployment.
- [ ] Prepare the release manifest and deployment checklist. After deployment is separately authorized, check login, key pages, media, health and background processing; roll back on failed acceptance.
- [ ] Record results before removing temporary files, generated credentials, fixture copies, containers, networks, task-owned volumes/images and isolated worktrees. Use the exact task project/files/environment for cleanup. Preserve intentional release artifacts and regression tests; never prune shared resources.

## Current validation record

- **Done:** inspected committed dependency resolutions, Next configurations, Pages Router entrypoints, middleware/session integration, Jest/browser setup and release/container scripts.
- **Done:** queried live stable package metadata through the pinned Compose Node image; identified the React 19.3.1 patch beyond the React documentation's release-family label.
- **Done:** removed the disposable metadata-query container and Compose network; no dependency files or application code were changed for this planning task.
- **Done:** Step 1 clean baseline installation, Prisma generation, lint, explicit typecheck, development/production builds, focused component tests and full fixture integration suite; results below.
- **Done:** Step 2 metadata, strict dependency resolution and disposable compatibility probes; decisions and limits below.
- **Done:** Step 3 intermediate dependency upgrades, compatibility fixes to test/lint dependencies, builds and integration validation; results below.
- **Done:** Step 4 React 19 upgrade, scoped JSX types, map regression fix and baseline type-error fixes; lint/typecheck, both application builds and 115 tests passed.
- **Done:** Step 5 framework/session/lint migration, typed builds, authentication and image/reload checks; savepoint commit follows this record.
- **Not run:** Step 6 final-image integration validation and Step 7 release/deployment preparation.

## Step 1 execution record — 2026-10-25

Baseline revision: `2d5dc8872b79df23e682694f4314908fef104504` (includes centralized Node/MariaDB pins). Checkpoint branch: `upgrade/next-react-baseline-6543c6`. A separate worktree and generated private test environment are used; no dependency or application changes are made. Disposable projects: `hmv-next-baseline-4071e7bc-dev` and `hmv-next-baseline-4071e7bc`. Both have published ports removed; test source media mounts remain read-only and databases/storage use new project-owned volumes. Public-image builds use a temporary empty Docker client configuration to avoid the failing desktop credential helper.

| Baseline check | Result | Evidence |
| --- | --- | --- |
| Clean install | Passed | Compose `dependencies npm ci --no-audit --no-fund`, exit 0 |
| Prisma generation | Passed | Compose `dependencies npx --no-install prisma generate`, exit 0 |
| Versions/dependency tree | Passed | Node 26.12.1; npm 11.20.0; Next 14.1.0; React/React DOM 18.2.0; TypeScript 5.2.2; ESLint 8.36.0; Next ESLint config 14.1.0; `npm ls` exit 0 |
| Lint | Passed with existing warning | `npm run lint`, exit 0; `src/components/content/contentList.tsx:56` missing `displayNextItems` effect dependency |
| Explicit TypeScript check | **Failed: pre-existing** | `npx --no-install tsc --noEmit --incremental false`, exit 2; seven diagnostics listed below |
| Build using development config | Passed | `dependencies npm run build`, exit 0; configured type-check bypass remains active |
| Production/test image build | Passed | Test Compose `build app migration testrunner`, exit 0; production app uses `next.config.js.prod` and standalone output |
| Fixture setup | Passed | Fresh database health, migration deploy, explicit seed, app/background startup and `scripts/initTestData.sh`, all exit 0 |
| Focused component tests | Passed | `npx --no-install jest --runInBand --runTestsByPath __tests__/components/albumDetails.test.tsx __tests__/components/pathnavigator.test.tsx`: 2 suites, 7 tests passed |
| Full fixture integration suite | Passed | Test Compose `testrunner npm test -- --runInBand`: **17 suites, 109 tests passed**, exit 0 |
| Cleanup | Passed | Verified project ownership, then removed containers, volumes, networks, task image tags, logs, private environment, temporary Docker configuration and isolated worktree; checkpoint branch retained |

Pre-existing TypeScript diagnostics (unchanged baseline):

- `__tests__/web/api/helpers/file.helper.ts:27`: TS2322, `TestFile[] | undefined` assigned to `TestFile[]`.
- `src/components/content/browserContentMenu.tsx:231` and `:232`: TS18047, `fileData` may be null.
- `src/pages/api/me.ts:33` and `:34`: TS2532 for possibly undefined cookie options, plus TS2339 because `CookieSerializeOptions` has no `ttl` property (four diagnostics).

These failures must be tracked separately from future upgrade regressions. Passing Next builds do not establish type safety because both existing configurations ignore build type errors.

Additional baseline observations: Docker's build checks emit `InvalidDefaultArgInFrom` warnings because base-image arguments have no Dockerfile defaults; Compose supplies the pinned arguments and all builds succeed. The production configuration skips lint and type validation, so its build result does not supersede the separately recorded checks. Dependency installation emits existing package deprecation notices; no dependency upgrade or audit remediation was attempted in Step 1.

The baseline source worktree remained Git-clean after validation. The checkpoint branch is retained intentionally at the baseline commit so later steps can recreate an isolated checkout; the temporary checkout itself is disposable. Step 1 is complete because all planned baseline checks ran and their existing failures are documented; this does **not** mean the baseline typecheck passes. Resolve the recorded issues as explicit prerequisite work before claiming a fully passing upgrade.

Cleanup verification: no containers or volumes remain for `hmv-next-baseline-4071e7bc`; development and cleanup project networks were removed. Only the original worktree remains. Container-created root-owned files initially prevented checkout deletion; ownership was restored through a disposable Compose container and cleanup then completed. The original development containers/data were preserved. Final documentation check: `git diff --check` passed.

## Step 2 execution record — 2026-10-25

Status: **Done — dependency choices and required migrations established; application implementation remains pending.** All experiments ran through the Compose `dependencies` service under the dedicated `hmv-next-step2` project. Temporary manifests/installations lived outside the repository; source was mounted read-only for component inspection/probes.

### Selected versions and dependency actions

`npm view <package>@<version-or-tag> version engines peerDependencies dependencies exports --json` reverified the metadata in Docker. Node 26.12.1 satisfies the selected Next.js, ESLint and session engine constraints; both centralized Node pins stay unchanged.

| Dependency | Selected exact version/action | Reason and phase |
| --- | --- | --- |
| React / React DOM preparation checkpoint | 18.3.1 / 18.3.1 | Step 3 warning checkpoint with Next 14.1.0 initially |
| Next.js / Next ESLint intermediate checkpoint | 15.5.28 / 15.5.28 | Newest 15.x checked; React 18.3.1, existing ESLint 8 and session 6 remain at this checkpoint |
| Next.js / Next ESLint final | 16.4.3 / 16.4.3 | Matching framework/lint configuration releases |
| React / React DOM final | 19.3.1 / 19.3.1 | Matching latest stable renderer/library patches |
| React / React DOM types | 19.3.0 / 19.3.0 | Matching React 19 declarations |
| Testing Library React / DOM | 16.3.3 / 10.4.2 | Compatible React 19 peers; DOM is an explicit peer dependency |
| `pigeon-maps` | Keep 0.21.3 | Actual map components work after the local fragment fix below |
| `react-leaflet`, `leaflet`, `@types/leaflet` | Remove in Step 4 | No source/test imports; location display and filter both use Pigeon Maps. Avoid migrating unused packages |
| `eslint` / `@eslint/js` | 9.39.5 / 9.39.5 | Compatible flat configuration without ESLint 10 plugin-peer conflicts |
| `typescript-eslint` | 8.72.0 | Supports ESLint 9 and TypeScript >=4.8.4, <6.1.0; resolves matching parser/plugin 8.72.0 |
| `typescript` | Keep 5.2.2 | Satisfies Next's >=5.1 minimum and selected lint types; scoped compiler probe passed. Latest 7.0.2 is outside the lint stack's peer range |
| `eslint-config-prettier` / `prettier` | Keep 8.10.0 / 3.2.4 | Existing locked versions work with the tested flat configuration; avoid unrelated formatting upgrades |
| `iron-session` | 9.0.1 in Step 5 | Current Node session/proxy API; Node >=22.13 is satisfied. Requires API/type/module migration and one-time reauthentication |

Remove legacy direct `eslint-config-standard-with-typescript`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint-plugin-react`, `eslint-plugin-react-hooks` and unused `eslint-plugin-prettier` entries in Step 5. The selected Next config supplies React/Hooks plugins, and `typescript-eslint` supplies the matching parser/plugin. The verified resolution selected React plugin 7.37.5 and Hooks plugin 7.1.1. Keep formatting as a separate Prettier command; retain the existing three rule exceptions when building the flat configuration.

All other direct dependencies were held at their existing lockfile versions during the probes, including Prisma/client 5.8.1, Jest/jsdom environment 29.7.0 and the Puppeteer/yargs setup. Their runtime acceptance remains part of later application validation.

### Resolution and compatibility evidence

| Probe | Result | Scope / limitation |
| --- | --- | --- |
| React 18.3.1 checkpoint manifest | Passed | `npm install --package-lock-only --ignore-scripts --strict-peer-deps --no-audit --no-fund` |
| Next 15.5.28 + React 18.3.1 checkpoint manifest | Passed | Same strict resolution; existing lint/session libraries retained |
| Final selected manifest | Passed | Same strict resolution, then `npm ci --ignore-scripts --strict-peer-deps --no-audit --no-fund` and `npm ls --all --json`, all exit 0; no peer override flags |
| Existing map components with React 19 | Found required source fix | `contentFilter.tsx` supplies a fragment as a direct Map child; Pigeon Maps injects layout props, causing two React console errors. Passing a raw DOM child also leaks injected props |
| Same components with isolated local map-center component fix | Passed | Keep real Pigeon Map/Marker; replace the fragment with a local component that renders the center div and does not forward injected map props. SSR location render, marker SVG/tile elements, zoom controls, filter callback and unmount pass with zero React console errors |
| Proposed flat lint configuration | Passed | `eslint --print-config probe.tsx`: 333 rules, TypeScript parser 8.72.0, enabled Hooks and TypeScript rules; config imports JS recommended, Next core-web-vitals/TypeScript, Prettier last, existing exceptions |
| TypeScript 5.2.2 with selected Next/React/session types | Passed with ESNext/Bundler | Minimal typed Pages API/session and JSX probe, `tsc --noEmit --skipLibCheck --esModuleInterop --jsx react-jsx --lib es2020,dom --module esnext --moduleResolution bundler --target es2020` |
| Same type probe with existing NodeNext mode | Expected incompatibility found | TS1479: the current CommonJS project cannot statically import ESM-only iron-session 9 under TS 5.2 NodeNext rules. Plan the configuration change below |
| iron-session 9 + Next 16 proxy cookie adapter | Passed | Real `NextRequest`/`NextResponse` and `nextProxyCookies`: absent session, cookie save/read/destroy, generated secret; no cookie/secret logged |

The map test transpiled the actual `locationMetadataDisplay.tsx` and `contentFilter.tsx` source using TypeScript and rendered it with Testing Library/jsdom. Auth context, API calls, CSS and the unrelated year/season component were stubbed; Pigeon Maps was real. External tile downloads, browser gestures, final styling and authenticated persistence are not established by this smoke test. Add focused regression coverage when implementing the map-center fix, then run browser validation in Step 6.

The clean candidate install intentionally skipped lifecycle scripts: this step proves resolution and the scoped JavaScript/configuration probes, not Prisma/native-module production acceptance. The repository manifest and lockfile remain unchanged.

### Session and TypeScript migration decision for Step 5

Select iron-session 9.0.1 and the Node proxy path. Preserve the cookie name, secret configuration, 14-day browser lifetime and HttpOnly/SameSite/Secure policy. v9 cannot read v6 cookies, so deployment requires existing users to sign in once; unchanged keys cannot avoid that format break. Version 8.0.4 was evaluated as a cookie-preserving bridge but is not the final target. Document reauthentication in deployment/rollback notes, and test rollback-cookie behavior explicitly. [Upstream session migration guide](https://github.com/vvo/iron-session/blob/main/MIGRATION.md)

Migrate the shared `src/utils/sessionRoute.ts` wrapper and the direct login/logout wrappers from removed `withIronSessionApiRoute` to awaited `getIronSession<SessionData>(req, res, options)`. Replace the old `IronSessionData` augmentation with an explicit shared data type and typed request/session boundary. Update `sessionHelper.ts` from `IronSessionOptions` to `SessionOptions`. Read sessions in `src/proxy.ts` through `nextProxyCookies`; retain the exact matcher, existing 403 behavior and API-side authorization. Cover failed login, expired/tampered sessions, logout and admin checks. Step 4 fixed the recorded `/api/me` TTL/type issues and added login/me expiry-unit regression checks; retain those checks through the session migration. [Session API and adapters](https://github.com/vvo/iron-session#usage)

Keep the package's CommonJS identity to avoid breaking the current Next configuration files. For application typechecking, plan `module: ESNext` and `moduleResolution: Bundler`, which passed the scoped TypeScript 5.2.2 probe. Configure a separate CommonJS/Node resolution override for `ts-node` seed/background commands, and verify both application and migration-container seed paths before shipping. Do not globally switch `package.json` to ESM or disable the compiler diagnostic. At this Step 2 checkpoint, full source typechecking still had the seven Step 1 failures and React 19 migration work pending; Step 4 resolves both.

The lint plan uses `eslint.config.mjs`, direct ESLint CLI execution over TS/TSX source and tests, and explicit lint/typecheck gates outside Next builds. The successful config-resolution probe is not a claim that the upgraded source already passes new lint rules. [Next flat configuration guidance](https://nextjs.org/docs/app/api-reference/config/eslint)

Cleanup status: **complete**. After recording the evidence, removed the disposable manifests, lockfiles, installations, probes, registry metadata, generated environment and task Compose network. No task containers remain; existing development services and repository dependency files were preserved. `git diff --check` passed.

## Step 3 execution record — 2026-10-25

Status: **Done**. Changes were validated in an isolated checkout of baseline `2d5dc8872b79df23e682694f4314908fef104504` before transferring intentional deliverables. Project `hmv-next3-37e1021b` uses generated private settings, no published ports, fresh database/storage volumes and read-only media mounts. Existing app and browser-runner images are reused with source bind mounts; no Docker image has been rebuilt.

React preparation checkpoint: **React/React DOM 18.3.1 with Next.js 14.1.0**. Strict installation, clean `npm ci`, Prisma generation, dependency-tree verification, lint and both development/production configuration builds passed. Explicit typechecking still reports the same seven baseline diagnostics. Focused component tests pass (2 suites, 7 tests); the full fixture suite passes (17 suites, 109 tests).

React 18.3.1 exposed `ReactDOMTestUtils.act` warnings from Testing Library 14.1.2. The already selected `@testing-library/react` 16.3.3 and `@testing-library/dom` 10.4.2 updates were moved forward from Step 4 as a Step 3 prerequisite. A fresh install and focused tests confirm the deprecation warning is gone. React 18 types and application/session behavior remain unchanged.

The initial test attempts did not exercise application code because the reused test image lacks `/usr/bin/chromium`. It contains Google Chrome 154.0.8037.97 at `/usr/bin/google-chrome-stable`; the disposable Compose override selects that executable. Browser/Jest commands run under that image's Node 20.20.2, while installs, typechecks, builds and the app run on Node 26.12.1. Initial content-page checks also lacked media fixtures; after isolated fixture initialization, the complete suite passed. Full upgraded-image/browser validation on the pinned Node 26 runner remains part of Step 6.

React checkpoint lockfile SHA-256: `abb28e3fd5933457534652b1a45542d05e77ec65e11308269b8b86452daf2bf0`. The checkpoint is recorded here; its temporary manifest/lockfile snapshots will be removed after final evidence is recorded.

Next.js checkpoint: **Next/Next ESLint config 15.5.28 with React/React DOM 18.3.1**. Docker `npm view next@15 version --json` rechecked 15.5.28 before installation. The Pages Router migration guide and relevant removed APIs were reviewed; source inspection found no applicable font/geolocation/App Router async-request migrations, so no broad codemod was run. Existing Pages routes, Edge middleware, iron-session 6 and React 18 types are preserved.

Two lint compatibility adjustments were required beyond peer resolution: direct Hooks plugin 4.6.0 conflicted with Next's nested 5.x plugin, resolved by selecting **5.2.0**; Next's current lint plugin reads `context.cwd`, absent in ESLint 8.36.0, resolved by selecting **ESLint 8.57.1**. ESLint remains on major 8 with the existing configuration until Step 5. Its package deprecation notice and the `next lint` deprecation are expected intermediate-tooling limitations. The lockfile also resolves `eslint-plugin-react` to **7.37.5**, satisfying Next's newer minimum within the existing manifest range.

| Check | React 18.3.1 / Next 14.1.0 checkpoint | Next 15.5.28 / React 18.3.1 checkpoint |
| --- | --- | --- |
| Strict targeted install | Passed | Passed |
| Clean `npm ci` + explicit Prisma generation | Passed, including after Testing Library update | Passed after lint-stack alignment |
| Dependency tree | Passed | Final `npm ls --all --json` passed |
| Lint | Passed with existing effect-dependency warning | Passed with the same warning; expected `next lint` deprecation |
| Explicit `tsc --noEmit --incremental false` | Same seven baseline errors | Same seven baseline errors; no new diagnostics |
| Development configuration build | Passed | Passed again against final dependency files |
| Production configuration build | Passed | Passed again against final dependency files; standalone output generated |
| Focused component checks | 2 suites / 7 tests passed; act warning removed | 2 suites / 7 tests passed |
| Login/layout browser checks | Covered by passing full suite after fixture initialization | 4 suites / 30 tests passed separately |
| Full fixture suite | **17 suites / 109 tests passed** | **17 suites / 109 tests passed** |

Production configuration builds temporarily selected `next.config.js.prod` as `next.config.js` only inside the disposable checkout, then restored the original configuration. These are application builds inside existing images, not Docker image rebuilds. No deployed image, database or container was updated. Build success continues to rely on the existing type-check bypass; the seven baseline type errors remain explicitly open.

Intentional deliverables transferred to the shared checkout: `home-media-viewer/package.json`, its regenerated `package-lock.json`, this plan, and the current-version note in `docs/container-builds.md`. Existing installed dependencies and running development containers were not changed; refresh bind-mounted development dependencies with the documented Docker `npm ci`/Prisma workflow when adopting this checkpoint. No source/configuration changes or React 19 upgrade were included.

Final Next 15 checkpoint lockfile SHA-256: `c91c546d41d7e79ea89e1986adb027e16b0bb2ed1a640d5cf4ea5555d4ff5fa6`.

Step 3 cleanup: **complete**. After recording results and verifying deliverable copies, checked task volume ownership and removed the task containers, volumes, network, temporary checkout, installed dependencies, fixture data, logs, scripts and generated credentials. No Docker images were built or removed. The original worktree and development app/database containers remain; `git diff --check` passed.


## Step 4 execution record — 2026-10-25

Status: **Done**. Validated in an isolated checkout of `1eef09c` (the committed Next 15 checkpoint), using project `hmv-next4-4e8e20d3`, generated private settings, no published ports, fresh database/storage volumes and read-only media. Reused the existing development and browser images with source bind mounts; no Docker image was rebuilt or pulled. Existing development services and installed dependencies were preserved.

### Changes

- Docker npm queries reverified React/React DOM **19.3.1** and both type packages **19.3.0**. Installed exact versions, retained Testing Library 16.3.3 / DOM 10.4.2, and removed unused React Leaflet, Leaflet and Leaflet types. Kept Next/Next ESLint config 15.5.28, TypeScript 5.2.2, Pigeon Maps 0.21.3 and session 6.3.1. Other direct dependency versions are unchanged.
- Reviewed the [React 19 upgrade guide and codemod list](https://react.dev/blog/2024/04/25/react-19-upgrade-guide). Source/test inspection found no removed render/hydrate/findDOMNode APIs, legacy context, string refs, function defaultProps, old act imports or zero-argument useRef calls requiring those codemods. Applied the relevant TypeScript migration directly: explicitly import scoped `JSX` in every component/page using `JSX.Element`, combining existing React imports. No global JSX shim or broad codemod was added. Next and next/jest use SWC's automatic JSX runtime; component/browser checks show no outdated-transform warning.
- Replaced the direct Pigeon Map fragment with a local `MapCenter` component that consumes no injected props and renders the original crosshair. Regression tests use real Pigeon Map/Marker under Strict Mode, check crosshair/tiles/marker, zoom/filter application, asynchronous metadata saving, unmounting and zero console warnings/errors.
- Resolved all seven baseline TypeScript diagnostics: explicitly narrow optional test-directory children; guard null/undefined file data before reading album membership; replace nonexistent cookie `ttl` access in `/api/me` with typed `maxAge`. Also corrected its ineffective authentication condition so an absent user cannot trigger an unfiltered database lookup.
- Expiry contract: `/api/me` and login return `sessionExpiresInSeconds` in **seconds**, and `sessionExpiresOn` as an epoch timestamp in **milliseconds**. Login previously multiplied the seconds field by 1000 even though the UI feeds it into cookie `max-age`; that multiplier is removed. Cookie name, secret, 14-day lifetime and flags are unchanged. API integration checks cover expiry units and unauthenticated requests; a handler regression rejects an absent session before any user query.
- Added a browser regression covering initial hydration, login, client navigation to search, opening/applying the location filter and returning to albums, with page-error and React-warning assertions.

### Validation

All commands ran through this project's Compose services, without `--force` or `--legacy-peer-deps`.

| Check | Result |
| --- | --- |
| Target metadata | Docker `npm view <package>@latest version` confirmed all four selected React/type patches |
| Dependency update and clean install | Strict targeted install, then `npm ci --strict-peer-deps --no-audit --no-fund`: passed |
| Prisma and fixture environment | Explicit Prisma generation, migration deploy, administrator seed, album/guest fixtures and metadata initialization: passed; schema/migrations unchanged |
| Dependency tree | `dependencies npm ls --all --json`: passed |
| Explicit TypeScript | `dependencies npx --no-install tsc --noEmit --incremental false`: passed; all seven baseline errors resolved |
| Lint | `dependencies npm run lint`: passed; only the pre-existing contentList effect dependency warning and expected intermediate `next lint` deprecation remain |
| Focused components, authentication and browser navigation | 6 suites / 14 tests passed; final absent-session unit regression also passed after lint-only test cleanup |
| Full fixture suite | `testrunner npm test -- --runInBand`: **21 suites / 115 tests passed**, with no React console warnings |
| Development configuration build | `run --rm --no-deps -e NODE_ENV=production dependencies npm run build`: passed |
| Production configuration build | Same command with `next.config.js.prod` temporarily selected only in isolation: passed, including standalone tracing; original config restored |

The initial strict install encountered obsolete React-18-only Leaflet peers still present in the old lockfile. Removed those unused dependencies from the lockfile through npm while retaining the React 18 checkpoint, then installed React/React DOM and both type targets together; the final strict clean install and complete dependency tree passed. No peer conflicts were suppressed. Only the selected React/type packages and their necessary `scheduler`/`csstype` dependencies changed versions.

The reused development image sets `NODE_ENV=development`. Its first production-build attempt warned about the environment and failed prerendering with a misleading document-import error. Explicitly selecting `NODE_ENV=production`, as the production Docker build does, fixed both configuration builds without a source workaround. Earlier setup-only checks ran before clean installation finished and were rerun after it completed. The initial map mock used an alias unsupported by Jest's mock resolver; the durable test uses a relative mock path. Fixture metadata initialization initially used `true` for a setting that expects numeric `1`; corrected only the generated task environment and completed its remaining metadata requests. These failed attempts were followed by the passing checks above.

Limits: the reused browser image still runs Node 20.20.2 / Google Chrome 154.0.8037.97, as in Step 3. Installation, typechecking, lint, builds and application runtime use Node 26.12.1. Fresh final-image validation on the pinned Node 26 browser runner remains Step 6. External map tile delivery and all real-world map gestures are not established by jsdom; the browser regression exercises the search overlay and navigation. Existing build type/lint bypass settings remain for Step 5, with independent type/lint gates passing here. Next 16, session 9 and flat ESLint migration are not included in this step.

Intentional deliverables: package manifest/lockfile, scoped JSX imports, map child fix, baseline type/auth/expiry fixes, four new regression files, expanded login assertions, this plan and the current-version note in `docs/container-builds.md`. Existing bind-mounted development dependencies must be refreshed deliberately using the documented Docker npm-ci/Prisma workflow when adopting this checkpoint.

Lockfile SHA-256: `50b99a1785bd6304bc16428491854cdbd703ecfef448cd5d9da63694315f9151`.

Cleanup: **complete**. Verified task-project volume/container ownership and deliverable copies, then removed its containers, volumes, network, temporary checkout/dependencies, credentials, fixtures, logs and orchestration scripts. No Docker images were built or removed. The original worktree, development services and data remain. `git diff --check` passed.


## Step 5 execution record — 2026-10-25

Status: **Done**. Isolated source started at React checkpoint `2d10888`; Compose project `hmv-next5-040d64ea` used fresh task-owned database/storage, generated credentials, no published ports and read-only fixtures. Reused development/browser images throughout this step; no image was rebuilt. The savepoint commit includes the plan (previously untracked) and the intentional changes below, before Step 6 starts.

### Implementation

- Reverified registry targets and installed exact Next/Next ESLint **16.4.3**, iron-session **9.0.1**, ESLint/@eslint/js **9.39.5**, and typescript-eslint **8.72.0**. Kept React/DOM 19.3.1, types 19.3.0 and TypeScript 5.2.2. Removed obsolete legacy presets/direct plugins, generated the lockfile through npm and completed a strict clean `npm ci` plus explicit Prisma generation and `npm ls --all`.
- Reviewed the Next 16 Pages upgrade guide and 16.4.3 release notes. Explicit `--webpack` flags retain the existing polling configuration. Removed obsolete Next `eslint` configuration and both type-check bypasses; production still outputs standalone. Added a direct ESLint command over TS/TSX source/tests and a `typecheck` command that runs `next typegen` before TypeScript. The production Docker builder copies lint inputs and runs lint before the typed Next build, so both production/test image builds enforce those gates.
- Migrated Edge `middleware.ts` to Node `proxy.ts` with `nextProxyCookies`. Preserved the exact matcher and 403 response. Replaced removed v6 route wrappers with an awaited, shared `getIronSession<SessionData>` boundary, including login/logout. Shared explicit session data types augment the Next API request rather than the removed iron-session data interface. Existing API administrator checks remain.
- Kept package CommonJS identity; application TypeScript now uses ESNext/Bundler and Next generated `jsx: react-jsx`. ts-node explicitly uses CommonJS/Node for seed/background entrypoints. No Prisma schema/migration changes.
- Flat lint imports JS recommended, Next core-web-vitals/TypeScript and Prettier, preserving the three prior exceptions. New effect-state diagnostics are **warnings**, explicitly documented in the config to preserve existing loading behavior during this framework migration; Compiler adoption remains outside scope. Other errors remain errors. Moved two effect helper declarations before use, replaced an empty derived interface with a type alias, and moved album scroll restoration out of render into an effect with timeout cleanup. The final lint pass reports **31 warnings / zero errors**, including existing unused values/stale disables, effect loading diagnostics and the known dependency warning. These are recorded debt, not a warning-free acceptance claim.
- Added real-library proxy/route-wrapper tests for absent, malformed, tampered, expired and valid cookies, cookie save/destroy and Secure/HttpOnly/SameSite/max-age policy. Added live API tests for incorrect-password cookie clearing, logout, tampering and guest administrator restrictions. Retained Step 4 expiry-unit tests.
- Added a live framework probe: unauthenticated thumbnail requests get 403; authenticated fixture thumbnails return image data with the existing one-hour cache policy; optimized public images accept quality 75 and reject unsupported quality 1. Media thumbnails use authenticated `<img>` requests, so no optimizer restriction was loosened.

### Validation and limits

| Check | Result |
| --- | --- |
| Strict clean install, Prisma generation, full dependency tree | Passed; no force/legacy-peer flags |
| Fresh migration and application seed | Passed under the CommonJS/Node ts-node override |
| `npm run typecheck` | Passed, including generated route declarations |
| `npm run lint` | Passed, zero errors / 31 documented warnings |
| Focused React/auth/browser suite | **7 suites / 17 tests passed** |
| Node 26 real session/proxy tests | **2 tests passed**, including secure-cookie policy and expired seals |
| HTTP thumbnail/image probe | Passed, including authentication, cache headers and image quality policy |
| Bind-mounted development reload | Passed: temporary `_document` marker appeared through Webpack polling; original source restored |
| Development configuration build | Passed with `NODE_ENV=production`, explicit Webpack, and TypeScript validation enabled |
| Production configuration build | Passed with standalone output and TypeScript validation enabled; original source config restored |

Initial strict resolution saw obsolete ESLint 6-era plugin peers in the old lockfile; retired removed packages with the prior framework/lint versions first, then resolved the final versions and clean-installed strictly. Early checks exposed an accidental helper rename and missing generated Next types; restored the existing helper name and made route generation explicit in typecheck. The first flat lint run exposed the component errors described above and the unsupported legacy ignore file, all addressed before acceptance. These attempts do not replace the successful final checks.

The reused browser/Jest image is still Node 20/Chrome; app, dependency commands, session probes and builds use Node 26. Step 6 will build the actual Node 26 runner and production app/migration images, verify migration-container seeding and run complete fixture/security/runtime checks. Both independent lint/typecheck and Next's build type validation now pass. No production deployment occurred.

Session compatibility: pre-v8 cookies require sign-in once after upgrade; rolling back to v6 requires a fresh sign-in for cookies minted by v9. Cookie name, configured secret and 14-day policy remain unchanged. See the [upstream migration guide](https://github.com/vvo/iron-session/blob/main/MIGRATION.md).

The original development app still had Next 14 installed. Once upgraded source files were transferred, that running process rewrote `jsx` to `preserve` and patched the new lockfile with an old SWC entry. Stopped only that app, restored the validated files, refreshed shared development dependencies with Docker strict `npm ci` and Prisma generation, then restarted it on Next 16. No image rebuild or shared database migration/reset was needed. This deliberate refresh supersedes the earlier steps' decision to leave installed development dependencies unchanged.

Cleanup: **complete** before the savepoint commit. Verified ownership and deliverable copies, then removed the isolated containers, volumes, network, checkout/dependencies, generated credentials and logs/scripts. Existing development services/data were preserved. No images were built or removed. `git diff --check` passed.
