import { createVitestProject } from '@nile/config/vitest';

export default createVitestProject('auth-screens', { setupFiles: ['@nile/test-utils/jsdom-setup'] });
