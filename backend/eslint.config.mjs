import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Flat ESLint config for the API (Node + Express + TypeScript).
// Linting is a developer aid only — it is NOT part of the build/deploy
// (`build` is `tsc`), so lint findings never block a release. Named `.mjs`
// because this package is CommonJS but the flat config uses ES module syntax.
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'prisma/migrations'] },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      // Pragmatic for this codebase: `any` is used deliberately (e.g. the Prisma
      // extension helpers); unused vars are a warning and allow the `_` opt-out.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
