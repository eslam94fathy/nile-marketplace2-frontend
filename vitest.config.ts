import { defineConfig } from 'vitest/config';

// Each workspace defines its own project (see @nile/config/vitest).
export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*'],
  },
});
