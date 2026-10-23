import { fileURLToPath } from 'node:url';
import { createVitestProject } from '@nile/config/vitest';

export default createVitestProject('agent', {
  setupFiles: ['./src/test/setup.ts'],
  alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
});
