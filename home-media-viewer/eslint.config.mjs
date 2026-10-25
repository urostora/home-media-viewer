import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'] },
  js.configs.recommended,
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      // Existing effect-driven loading flows predate the compiler diagnostics.
      // Keep these visible while preserving their behavior during this upgrade.
      'react-hooks/set-state-in-effect': 'warn',
      '@next/next/no-img-element': 'off',
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },
  prettier,
);
