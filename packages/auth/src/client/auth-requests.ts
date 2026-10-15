import { apiErrorFromResponse, HEADER, networkError, type Schema } from '@nile/api';

// Browser calls to this app's token-issuing auth routes (design 01 §4.1). They answer in the backend
// envelope, so failures become the same ApiError the API client throws, handled by code.

export type SignedInUser = Schema<'AuthUserDto'>;

const SIGN_IN_ROUTES = {
  login: '/api/auth/login',
  verifyEmail: '/api/auth/verify-email',
  invite: '/api/auth/invite',
} as const;

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    // Same-origin, resolved explicitly so non-browser runtimes (tests) send the same request.
    response = await fetch(new URL(path, window.location.origin), {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        [HEADER.CLIENT]: '1',
        [HEADER.CORRELATION_ID]: crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw networkError(cause);
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = undefined;
  }
  if (!response.ok) throw apiErrorFromResponse(response, parsed);
  const data = (parsed as { success?: unknown; data?: unknown } | undefined)?.data;
  if (data === undefined)
    throw networkError(new Error('response is not a success envelope'), response.status);
  return data as T;
}

/** Signs in (sets the session cookie). Errors: the backend's codes, plus `WRONG_APP` with the role. */
export function signIn(body: { email: string; password: string }): Promise<{ user: SignedInUser }> {
  return postJson(SIGN_IN_ROUTES.login, body);
}

/** Verifies the email with the emailed code and signs in (storefront, seller). */
export function verifyEmailAndSignIn(body: { email: string; otp: string }): Promise<{ user: SignedInUser }> {
  return postJson(SIGN_IN_ROUTES.verifyEmail, body);
}

/**
 * Accepts an admin or agent invite on the storefront's landing page: the password is set, but no session is
 * kept (architecture §5.7). Answers the role and email, so the page can send the invitee to their app.
 */
export function acceptInvite(body: { token: string; password: string }): Promise<{
  role: SignedInUser['role'];
  email: string;
}> {
  return postJson(SIGN_IN_ROUTES.invite, body);
}

/** The role of a `WRONG_APP` error (`details[0].value`), so the screen can point to the right site. */
export function wrongAppRole(error: {
  details: readonly { field: string; value?: string }[];
}): string | null {
  return error.details.find((detail) => detail.field === 'role')?.value ?? null;
}
