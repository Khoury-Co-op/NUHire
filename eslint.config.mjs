// One ESLint config for the whole repo (INFRA-5). CI's lint job runs it on the
// files a PR changes and blocks the PR on any error. To check a file before
// pushing: npx eslint path/to/file.tsx
//
// Deliberately not here: no-explicit-any and no-console. Older files still
// have both, and lint runs on whole changed files, so turning them on would
// fail every PR over code it did not write. CodeRabbit flags new ones.
//
// frontend's build script is `next build --no-lint`: Next.js would otherwise
// find this config, lint every file during the build, and fail the build over
// older files' problems. Linting is CI's lint job, on the files a PR changes.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/*.d.ts',
      'frontend/public/**',
      'docs/archive/**',
      // The Prisma client `prisma generate` writes. Not committed.
      'api/src/generated/**',
      // Cloud-sync conflict copies, e.g. "page 2.tsx". Same exclusion as
      // frontend/tsconfig.json.
      '**/* [0-9].*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // `_next` has to stay on Express error handlers, which Express tells
      // apart by their four arguments; `_` marks a value skipped on purpose.
      // An unused `catch (error)` is fine.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // passport-keycloak-oauth2-oidc ships no type definitions, so an import
      // of it cannot typecheck. Every other module must use import.
      '@typescript-eslint/no-require-imports': [
        'error',
        { allow: ['^passport-keycloak-oauth2-oidc$'] },
      ],
    },
  },
  {
    files: [
      'api/**/*.{ts,js}',
      '.github/**/*.mjs',
      '.local/**/*.mjs',
      '*.config.{js,mjs}',
      'frontend/*.config.js',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    // Data access lives in api/src/repository. Keeping Prisma's generated types
    // there too means a column Prisma reads differently from mysql2, such as a
    // tinyint(1) arriving as a boolean, is mapped back in one place rather than
    // in every controller that touches it.
    files: ['api/src/**/*.ts'],
    ignores: ['api/src/repository/**', 'api/src/config/database.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/generated/prisma',
                '**/generated/prisma/**',
                '@prisma/client',
                '@prisma/client/**',
              ],
              message:
                'Query through a repository in api/src/repository instead of the Prisma client.',
            },
          ],
        },
      ],
    },
  },
  {
    // The goal is no SQL in api/src at all, Prisma's raw calls included. A
    // write that has to be atomic uses the helpers in repository/writes.ts.
    files: ['api/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...[
          '$queryRaw',
          '$executeRaw',
          '$queryRawUnsafe',
          '$executeRawUnsafe',
          '$queryRawTyped',
        ].map((property) => ({
          property,
          message:
            "Use Prisma's query API. For a write that must be atomic, see api/src/repository/writes.ts.",
        })),
      ],
    },
  },
  {
    files: ['frontend/**/*.{ts,tsx,js,jsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, '@next/next': nextPlugin },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
    },
  },
  {
    files: ['**/*.test.ts'],
    languageOptions: { globals: globals.node },
  }
);
