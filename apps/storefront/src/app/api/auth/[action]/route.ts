import { createAuthRouteHandler } from '@nile/auth/server';
import { authConfig } from '@/lib/server/auth-config';

// Sign-in, token refresh and sign-out for this app (design 01 §4.1). Tokens stay on the server.
export const POST = createAuthRouteHandler(authConfig);
