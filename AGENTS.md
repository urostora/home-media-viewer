# Repository Guidelines

The application is a Next.js Pages Router + React + strict TypeScript project using Prisma and MariaDB. Its package is `home-media-viewer/`; Compose files, Dockerfiles, scripts, and `test/files/` media fixtures live at the repository root.

## Read only the guides relevant to the task

- Planning, review, or documentation: start here and inspect the affected material; read domain guides only as needed.
- Implementation: [development](.agents/development.md).
- Larger development tasks with multiple dependent subtasks or likely interruptions: also read [large-task workflow](.agents/large-task-workflow.md) before implementation.
- UI changes: also read [frontend](.agents/frontend.md).
- Writing tests or choosing validation: [testing](.agents/testing.md).
- Running application, dependency, build, lint, test, or Prisma commands: [Docker execution](.agents/docker-execution-guidelines.md).

## Repository rules

- Preserve existing worktree changes; keep edits targeted and follow nearby patterns.
- Run application and tooling commands through Docker. File inspection, editing, and Git may run on the host.
- Do not reset databases or delete shared volumes or generated media without explicit task authorization. Keep source media mounts read-only; do not print or commit secrets or personal media.
- After each task or subtask, record validation results, then remove its temporary files, credentials, fixtures, containers, and isolated Docker resources. Preserve intentional deliverables, regression tests, and pre-existing/shared resources. Temporary artifacts may be retained when explicitly requested.
- For larger tasks, retain `temp/tasks/YYYY-MM-DD-short-description/plan.md` and `cache.md` as intentional task records, including after completion; clean up other disposable resources normally.
- Report changed files, validation results, and checks that could not run. The final response is sufficient unless persistent task documentation is requested.
