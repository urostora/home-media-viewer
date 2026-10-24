# Next.js & React Front-End Guidelines

This filename is retained for existing links. The application uses Next.js Pages Router, not Nuxt or Next.js App Router.

- Prefer existing state and data flow before introducing a new pattern.
- Keep React components small, focused, and easy to reason about.
- Check the parent/child data flow before adding new prop drilling or context usage.
- Follow `home-media-viewer/src/pages/` routing, including dynamic routes, API routes, `_app.tsx`, and `_document.tsx`. Do not introduce App Router conventions as part of an unrelated change.
- Review React hook dependencies and asynchronous state updates. Preserve loading, empty, error, and success states; account for unmounts and stale responses when changing fetch flows.
- Reuse `src/utils/frontend/dataSource/` for existing API client patterns and `src/types/api/` for API contracts. Keep database access and secrets in server-side code.
- Use the `@/` alias for imports under `src/` and existing CSS/SCSS modules under `src/styles/`.
- Use the current routing conventions instead of creating custom route handling unless the task explicitly requires it.
- Before changing UI behavior, look for relevant tests in `home-media-viewer/__tests__/components/` and browser tests in `__tests__/web/pages/`. Use React Testing Library and existing MSW handlers for component tests; prefer observable behavior and accessible selectors.
- Preserve session and admin checks in API handlers when modifying UI flows that call them.
