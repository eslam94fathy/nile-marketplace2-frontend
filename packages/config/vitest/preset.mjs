import { defineProject } from 'vitest/config';

/**
 * One Vitest project per workspace (apps/*, packages/*), collected by the root vitest.config.ts.
 * Unit tests run in Node; component tests opt into jsdom per file once React tests exist (T-B7).
 * @param {string} name workspace name, shown as the project label in test output
 */
export function createVitestProject(name) {
  return defineProject({
    test: {
      name,
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tsconfig/**/*.test.ts'],
    },
  });
}
