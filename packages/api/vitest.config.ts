import { createVitestProject } from '@nile/config/vitest';

export default createVitestProject('api', { include: ['scripts/**/*.test.ts', 'contract/**/*.test.ts'] });
