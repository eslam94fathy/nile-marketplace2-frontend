import { HEADER } from '@nile/api';

// CSRF check for every mutating BFF and auth route (design 01 §4.3, architecture §5.6): on top of
// SameSite=Lax, the request must come from our own origin and carry a header a cross-site form can't send.

export const CLIENT_HEADER_VALUE = '1';

export type CsrfResult =
  { ok: true } | { ok: false; reason: 'origin-missing' | 'origin-mismatch' | 'client-header' };

export function checkCsrf(request: Request, appOrigin: string): CsrfResult {
  const origin = request.headers.get('Origin');
  if (origin === null) return { ok: false, reason: 'origin-missing' };
  if (origin !== appOrigin) return { ok: false, reason: 'origin-mismatch' };
  if (request.headers.get(HEADER.CLIENT) !== CLIENT_HEADER_VALUE)
    return { ok: false, reason: 'client-header' };
  return { ok: true };
}
