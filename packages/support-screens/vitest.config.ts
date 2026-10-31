import { createVitestProject } from '@nile/config/vitest';

export default createVitestProject('support-screens', { setupFiles: ['@nile/test-utils/jsdom-setup'] });
