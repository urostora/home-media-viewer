import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

export default defineConfig(
    globalIgnores(['coverage/**']),
    { linterOptions: { reportUnusedDisableDirectives: 'error' } },
    js.configs.recommended,
    ...nextVitals,
    {
        files: ['**/*.{ts,tsx,mts,cts}'],
        extends: nextTypeScript,
    },
    {
        files: ['*.{js,cjs,mjs}', '*.js.prod'],
        languageOptions: { globals: globals.node },
    },
    {
        files: ['*.{js,cjs}', '*.js.prod'],
        languageOptions: { sourceType: 'commonjs' },
    },
    {
        files: ['*.mjs'],
        languageOptions: {
            sourceType: 'module',
            globals: { require: 'off', module: 'off', exports: 'off', __dirname: 'off', __filename: 'off' },
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
