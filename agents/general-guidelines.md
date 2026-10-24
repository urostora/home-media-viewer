# Home Media Viewer Coding Agent Guidelines

## Core project context
- This is a Next.js Pages Router application using React, strict TypeScript, Prisma, and MariaDB.
- Resolve paths relative to the checkout root; the application package is `home-media-viewer/`.
- Follow the existing architecture and naming patterns before introducing new abstractions.

## Standard workflow
- Read the relevant files and existing tests before changing behavior.
- Prefer small, targeted edits over broad rewrites.
- Reuse project utilities and established data access patterns.
- Add basic error handling around I/O and network work.

## Project structure
- `home-media-viewer/src/pages/`: routes and API handlers in `api/`.
- `home-media-viewer/src/components/`, `src/styles/`, and `public/`: React UI, CSS/SCSS, and public assets.
- `home-media-viewer/src/utils/` and `src/types/`: shared logic, data access, and contracts. The `@/` alias resolves to `src/`.
- `home-media-viewer/prisma/`: database schema, migrations, and seed logic.
- `home-media-viewer/__tests__/`: component, utility, API, and browser tests; `test/files/`: media fixtures.
- Root `docker/` and `scripts/`: container definitions, test initialization, builds, and backups.

## Style and naming
- Follow nearby code; existing component filenames use lower camel case, with PascalCase React component names.
- Use `.tsx` for JSX and `.ts` for other TypeScript. Prefer explicit types at API and data boundaries.
- Follow `.prettierrc`: semicolons, single quotes, trailing commas, and a 120-character print width. No indentation override is configured; avoid unrelated reformatting.
- Use the package ESLint configuration and Docker commands in the execution guide. The existing formatting script covers `.ts` files only; include `.tsx` explicitly when formatting affected React files.

## Testing
- Jest uses `next/jest`, jsdom, and the `jest-puppeteer` preset. Component tests use React Testing Library and MSW; web tests require the application and fixture database.
- Name tests `*.test.ts` or `*.test.tsx` under `__tests__/`, mirroring the relevant feature. Reuse existing `*.helper.ts` modules.
- Run focused tests first; cover changed behavior and error paths. `npm test` collects coverage, but Jest currently defines no minimum coverage threshold.

## Data and configuration
- Reuse `src/utils/prisma/prismaImporter.ts` for Prisma access and existing API/session helpers for authentication and authorization.
- Inspect migrations and seed behavior before schema changes. Do not reset databases or delete volumes or generated media storage without explicit task authorization.
- Do not commit or print secrets from `.env*`, session secrets, process tokens, or personal media. Keep source media mounts read-only.

## Commits and pull requests
- History uses concise, descriptive subjects, sometimes with a scope such as `doc(readme): ...`; no uniform prefix convention is established.
- Keep commits focused. PRs should explain behavior changes, validation, and migration or configuration requirements; link relevant issues and include screenshots for visible UI changes.

## Front-end expectations
- Keep React components focused and self-contained.
- Check the current state and data flow before adding new stores or prop chains.
- Follow the Next.js Pages Router and existing React hook patterns; see the front-end guide.
