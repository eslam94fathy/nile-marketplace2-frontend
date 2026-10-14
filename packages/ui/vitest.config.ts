import { createVitestProject } from '@nile/config/vitest';

export default createVitestProject('ui', { setupFiles: ['./src/test/setup.ts'] });
