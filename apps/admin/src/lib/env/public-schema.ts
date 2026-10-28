import { mediaUploadPublicEnvExtension, publicEnvSchema } from '@nile/config/env';
import { APP } from '../app';

// Relative imports only: next.config.ts loads this file outside the app bundler (no path aliases there).
export const publicEnvSchemaForApp = publicEnvSchema(APP.name).extend(mediaUploadPublicEnvExtension);
