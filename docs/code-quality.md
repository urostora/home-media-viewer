# ESLint and Prettier

Reviewed on 2026-11-08 against the official [Next.js ESLint guide](https://nextjs.org/docs/pages/api-reference/config/eslint), [Prettier installation guide](https://prettier.io/docs/install) and [TypeScript-ESLint typed linting guide](https://typescript-eslint.io/getting-started/typed-linting/).

The application uses ESLint flat config with the JavaScript recommended rules and the Next.js Core Web Vitals and TypeScript presets. These provide React, Hooks, accessibility and framework checks. Keep the Next.js preset version aligned with Next.js; avoid adding duplicate React/Hook presets.

ESLint remains pinned to 9.39.5, the latest compatible 9.x release. As of this review, the latest ESLint is 10.14.0, but the Next.js preset depends on `eslint-plugin-react` 7.37.5 and `eslint-plugin-jsx-a11y` 6.10.2, whose peer dependency ranges exclude ESLint 10. Revisit the major upgrade when those plugins support it; do not bypass dependency resolution with `--force` or `--legacy-peer-deps`. `eslint-config-prettier` is pinned to 10.1.8.

Prettier handles formatting separately. `eslint-config-prettier` stays last to disable conflicting lint rules. Its compatibility checker reports no conflicts with the current configuration. `npm run lint` rejects warnings, and unused suppression comments are errors. A documented exception permits native images in media-content components using authenticated thumbnails and native sizing.

Root-level application `.js`/`.cjs` scripts and `next.config.js.prod` use CommonJS; `.mjs` scripts use ESM and reject undeclared CommonJS globals. TypeScript rules cover `.ts`, `.tsx`, `.mts` and `.cts`.

The root `.editorconfig` and application `.prettierrc` specify four spaces. This is the project's style preference, not a requirement of React or TypeScript. Semicolons, single quotes, trailing commas and a 120-character print width are also valid project choices. The root `prettier.config.mjs` shares the application settings with repository-code editors. Both working directories have explicit ignore files for generated output, lockfiles and immutable inputs. Prettier is pinned to the already installed version, 3.9.10, for reproducible formatting.

Run the application checks through Docker:

```sh
docker compose exec app npm run lint
docker compose exec app npm run typecheck
docker compose exec app npm run format:check
```

Format application code with `npm run prettier-format` in the app container. Use `bash scripts/format.sh --check` or `--write` from the repository root for JavaScript, TypeScript, styles, JSON, YAML and Bash tooling too. Application linting does not cover the repository's sibling `scripts/` and `docker/test/` trees; the root formatting command does.

## Further improvements

TypeScript's `strict` compiler setting and the current ESLint preset do not enable type-aware ESLint rules. The recommended next step is a separate adoption of `typescript-eslint`'s `recommendedTypeChecked` preset with `parserOptions.projectService` and an explicit `tsconfigRootDir`. Include it before the final Prettier configuration and scope it to TypeScript files. Keep Node JavaScript configuration files outside the typed block unless deliberately configuring an allow-list/default project.

A read-only trial on 204 application, seed and test files produced 171 diagnostics, including 6 floating promises, 41 unsafe assignments and 64 unbound methods. Review each category and the distinction between production code and test mocks; do not hide them behind a blanket disable or convert them all to warnings. The trial exceeded the development app's heap limit; it completed in a disposable tooling container with a 1536 MB Node heap. Budget lint memory/time before enabling the preset in CI and container builds.

CI should run lint, typecheck and the formatting check independently of tests. Production image builds currently run application lint; they do not run the separate formatting check. A future repository-wide lint entry point should also cover the Node tooling under `scripts/` and `docker/test/` with appropriate Node/test globals. These changes require separate scope from the present settings review.
