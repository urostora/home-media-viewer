import { readFileSync } from 'node:fs';

// Share the application configuration with editors working on repository tooling.
// The application keeps its own config because its Docker mount is package-only.
export default JSON.parse(readFileSync(new URL('./home-media-viewer/.prettierrc', import.meta.url), 'utf8'));
