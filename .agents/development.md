# Development

Paths below are relative to `home-media-viewer/`.

- Routes and API handlers live in `src/pages/`; shared logic and contracts live in `src/utils/` and `src/types/`. The `@/` alias resolves to `src/`.
- Existing component filenames use lower camel case, with PascalCase React component names.
- Use `.prettierrc` and `eslint.config.mjs` as the formatting and lint sources of truth. Use four spaces for indentation, as configured in the root `.editorconfig` and application `.prettierrc`. The `prettier-format` script covers application source, tests, seed and configuration code, including `.tsx` and styles; `npm run format:check` verifies it. Run both through Docker.

## Data, authentication, and media

- For Prisma changes, inspect `prisma/schema.prisma`, existing migrations, seed behavior, and the shared client in `src/utils/prisma/prismaImporter.ts`. Reuse that client for database access.
- Reuse existing API/session helpers and preserve authentication and admin checks in API handlers.
- For media processing changes, inspect `src/utils/fileProcessor/` and `src/backgroundProcesses/` before changing behavior.

Read [testing](testing.md) when selecting validation and [Docker execution](docker-execution-guidelines.md) before running commands.
