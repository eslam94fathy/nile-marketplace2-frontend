import { createBffRouteHandler } from '@nile/auth/server';
import { authConfig } from '@/lib/server/auth-config';

// The browser's only way to the backend: allow-listed operations, Bearer token added from the session
// cookie (design 01 §4.2).
export const { GET, POST, PATCH, PUT, DELETE } = createBffRouteHandler(authConfig);
