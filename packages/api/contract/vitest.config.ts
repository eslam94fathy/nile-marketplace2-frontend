import { defineProject } from 'vitest/config';

// Contract suite only (`npm run test:contract`): needs a running backend and Mailpit, so it is not part of
// the root `npm test` projects. One file, run in order, with network-sized timeouts.
export default defineProject({
  test: {
    name: 'contract',
    root: import.meta.dirname,
    include: ['**/*.contract.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
