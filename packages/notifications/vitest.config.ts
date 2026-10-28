import { createVitestProject } from '@nile/config/vitest';

export default createVitestProject('notifications', { setupFiles: ['@nile/test-utils/jsdom-setup'] });
