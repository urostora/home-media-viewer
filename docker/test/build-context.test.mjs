// Run from the root of a COPY of the Docker build context, with no application dependencies.
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";

for (const path of [
  ".git",
  ".env",
  ".env-prod",
  "home-media-viewer/node_modules",
  "home-media-viewer/.next",
  "home-media-viewer/next-env.d.ts",
  "home-media-viewer/coverage",
  "test/files",
]) {
  assert(
    !existsSync(path),
    `Private/local/runtime data leaked into build context: ${path}`,
  );
}
for (const path of [
  "home-media-viewer/package.json",
  "home-media-viewer/package-lock.json",
  "home-media-viewer/prisma/schema.prisma",
  "home-media-viewer/src/utils/passwordHelper.ts",
  "docker/prod/migration/package.json",
  "docker/prod/migration/package-lock.json",
  "home-media-viewer/public",
  "home-media-viewer/validateProductionConfig.mjs",
  "scripts/backup/backup.py",
]) {
  assert(existsSync(path), `Required build input excluded: ${path}`);
}
const directory = "home-media-viewer/prisma/migrations";
const migrations = readdirSync(directory, { withFileTypes: true }).filter(
  (entry) => entry.isDirectory(),
);
assert(migrations.length > 0);
for (const entry of migrations) {
  assert(
    existsSync(`${directory}/${entry.name}/migration.sql`),
    `Migration SQL excluded: ${entry.name}`,
  );
}
console.log(
  `Build context exclusions and ${migrations.length} complete migrations passed`,
);
