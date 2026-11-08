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
        files: ['src/components/content/**/*.tsx'],
        rules: {
            // Media views use authenticated thumbnail endpoints, data URLs, and native sizing.
            '@next/next/no-img-element': 'off',
        },
    },
    prettier,
);
