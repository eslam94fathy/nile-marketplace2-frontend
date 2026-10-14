import { defineProject } from 'vitest/config';

const DEFAULT_INCLUDE = ['src/**/*.test.ts', 'src/**/*.test.tsx'];

/**
 * One Vitest project per workspace (apps/*, packages/*), collected by the root vitest.config.ts.
 * Unit tests run in Node; component tests opt into jsdom per file once React tests exist (T-B7).
 * @param {string} name workspace name, shown as the project label in test output
 * @param {{ include?: string[], setupFiles?: string[], alias?: Record<string, string> }} [options] extra test globs
 *   added to src/**, setup files run before each test file (e.g. browser APIs jsdom lacks), and import aliases
 *   (an app's `@/` → `src/`, as in its tsconfig)
 */
export function createVitestProject(name, options = {}) {
  return defineProject({
    resolve: { alias: options.alias ?? {} },
    test: {
      name,
      environment: 'node',
      include: [...DEFAULT_INCLUDE, ...(options.include ?? [])],
      setupFiles: options.setupFiles ?? [],
    },
  });
}
