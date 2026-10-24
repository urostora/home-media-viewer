# Repository Guidelines

Use these files in order when working on the project:

- [agents/general-guidelines.md](agents/general-guidelines.md) for the core project rules
- [agents/docker-execution-guidelines.md](agents/docker-execution-guidelines.md) for container and command requirements
- [agents/nuxt-react-guidelines.md](agents/nuxt-react-guidelines.md) for Next.js and React patterns (legacy filename)

## Workflow
1. Read the files above in order before making changes; inspect affected code, configuration, and nearby tests.
2. Prefer the existing project patterns and utility code over introducing new abstractions.
3. Keep changes small and targeted.
4. Run build, test, and dependency commands through Docker and use the Compose service names for database access.
5. Preserve existing worktree changes. Report changed files, validation results, and checks that could not run.

The application lives in `home-media-viewer/`; Compose files, Dockerfiles, scripts, and media fixtures live at the repository root. This is a **Next.js Pages Router + React + TypeScript** project, not a Nuxt application.

For Prisma work, inspect `home-media-viewer/prisma/schema.prisma`, existing migrations, and the shared Prisma client before changing behavior. For media processing, inspect `src/utils/fileProcessor/` and `src/backgroundProcesses/` within the application directory.
