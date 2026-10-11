# Coding Agent Guidelines Index

Use these files in order when working on the project:

- [agents/general-guidelines.md](agents/general-guidelines.md) for the core project rules
- [agents/docker-execution-guidelines.md](agents/docker-execution-guidelines.md) for container and command requirements
- [agents/nuxt-react-guidelines.md](agents/nuxt-react-guidelines.md) for front-end patterns

## Workflow
1. Read the relevant guidance before making changes.
2. Prefer the existing project patterns and utility code over introducing new abstractions.
3. Keep changes small and targeted.
4. Run build, test, and dependency commands through Docker and use the Compose service names for database access.

For Prisma or domain-specific work, check the corresponding project files before changing behavior.