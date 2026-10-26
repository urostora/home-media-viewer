# Frontend

Paths below are relative to `home-media-viewer/`.

- Follow Pages Router conventions in `src/pages/`, including `_app.tsx` and `_document.tsx`. Do not introduce App Router conventions in unrelated changes.
- Reuse `src/utils/frontend/dataSource/` for API clients and `src/types/api/` for contracts. Keep database access and secrets in server-side code.
- Use existing CSS/SCSS modules under `src/styles/`.
- When changing fetch flows, preserve loading, empty, error, and success states; handle stale responses and unmounts.
- Relevant tests live in `__tests__/components/` and `__tests__/web/pages/`. Reuse existing React Testing Library and MSW patterns; see [testing](testing.md) for execution requirements.
