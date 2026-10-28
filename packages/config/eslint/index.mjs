import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier/flat';
import pluginQuery from '@tanstack/eslint-plugin-query';
import tseslint from 'typescript-eslint';

/**
 * Shared flat config (CLAUDE.md §1, §10): Next.js core-web-vitals (react, react-hooks, jsx-a11y, import,
 * @next/next) + TanStack Query rules + typescript-eslint strict and stylistic type-checked rules + prettier last.
 * ESLint stays on 9.x until eslint-config-next supports ESLint 10 (its bundled eslint-plugin-react crashes
 * on ESLint 10; CLAUDE.md §14.3 TB-1).
 * @param {{ tsconfigRootDir: string }} options
 */
export function createEslintConfig({ tsconfigRootDir }) {
  return tseslint.config(
    {
      ignores: [
        '**/node_modules/**',
        '**/.next/**',
        '**/out/**',
        '**/coverage/**',
        '**/next-env.d.ts',
        'playwright-report/**',
        'test-results/**',
        // Byte-exact artefacts of `npm run api:gen` / `api:pull` (checked by `npm run api:check`).
        'packages/api/src/generated/**',
        'packages/api/openapi/**',
      ],
    },
    js.configs.recommended,
    ...nextVitals,
    ...pluginQuery.configs['flat/recommended'],
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      settings: {
        next: { rootDir: ['apps/*/'] },
      },
      linterOptions: { reportUnusedDisableDirectives: 'error' },
      rules: {
        // Matches verbatimModuleSyntax: type-only imports are explicit.
        '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
        '@typescript-eslint/no-import-type-side-effects': 'error',
        // Template literals with numbers are fine; anything else must be converted on purpose.
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        // CLAUDE.md §10: no console in application code (scripts may log).
        'no-console': 'error',
        eqeqeq: ['error', 'always'],
      },
    },
    {
      // The Web Push service worker (design 01 §15.5): plain JavaScript served as is, in no TypeScript
      // project, running in the worker scope.
      files: ['apps/*/public/sw.js', 'packages/notifications/src/service-worker.js'],
      ...tseslint.configs.disableTypeChecked,
      languageOptions: {
        sourceType: 'script',
        globals: { self: 'readonly', URL: 'readonly' },
      },
    },
    {
      // The socket client lives only in @nile/realtime (design 01 §15.1): it holds the access token.
      ignores: ['packages/realtime/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              { name: 'socket.io-client', message: 'Use @nile/realtime: only it may open the socket.' },
            ],
            patterns: [
              { group: ['socket.io-client/*'], message: 'Use @nile/realtime: only it may open the socket.' },
            ],
          },
        ],
      },
    },
    {
      files: ['**/*.{js,mjs,cjs}'],
      ...tseslint.configs.disableTypeChecked,
      rules: { ...tseslint.configs.disableTypeChecked.rules, 'no-console': 'off' },
    },
    prettier,
  );
}
