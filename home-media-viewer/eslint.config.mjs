import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

export default defineConfig(
  globalIgnores(['coverage/**']),
  js.configs.recommended,
  ...nextVitals,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: nextTypeScript,
  },
  {
    files: ['*.{js,cjs,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Existing effect-driven loading flows predate the compiler diagnostics.
    // Keep warnings on these files while enforcing the preset on new components.
    files: [
      'src/components/content/albumDetails.tsx',
      'src/components/content/browserContentList.tsx',
      'src/components/content/contentList.tsx',
      'src/components/content/filteredContentList.tsx',
      'src/components/content/userListPage.tsx',
      'src/components/fileList.tsx',
      'src/components/layout/layout.tsx',
    ],
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['src/components/content/**/*.tsx'],
    rules: {
      // Media views use authenticated thumbnail endpoints, data URLs, and native sizing.
      '@next/next/no-img-element': 'off',
    },
  },
  prettier,
);
