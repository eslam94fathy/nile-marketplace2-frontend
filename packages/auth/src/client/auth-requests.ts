import { apiErrorFromResponse, HEADER, isApiError, networkError, type Schema } from '@nile/api';

// Browser calls to this app's token-issuing auth routes (design 01 §4.1). They answer in the backend
// envelope, so failures become the same ApiError the API client throws, handled by code.

export type SignedInUser = Schema<'AuthUserDto'>;

const SIGN_IN_ROUTES = {
  login: '/api/auth/login',
  verifyEmail: '/api/auth/verify-email',
  invite: '/api/auth/invite',
  passwordChange: '/api/auth/password-change',
} as const;

/** POSTs JSON to an auth route; resolves to the parsed body, throws ApiError for a non-2xx answer. */
async function post(path: string, body: unknown): Promise<{ response: Response; parsed: unknown }> {
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
  return { response, parsed };
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const { response, parsed } = await post(path, body);
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

/**
 * Changes the signed-in user's password; this session stays signed in, every other one ends (spec 03 §4.9b).
 * An expired access token (401 UNAUTHENTICATED) is refreshed through `onUnauthenticated` (the app's refresh
 * coordinator) and the call retried once; any other failure is thrown as ApiError.
 */
export async function changePassword(
  body: { currentPassword: string; newPassword: string },
  onUnauthenticated: () => Promise<boolean>,
): Promise<void> {
  try {
    await post(SIGN_IN_ROUTES.passwordChange, body);
  } catch (error) {
    if (!isApiError(error, 'UNAUTHENTICATED') || !(await onUnauthenticated())) throw error;
    await post(SIGN_IN_ROUTES.passwordChange, body);
  }
}

/** The role of a `WRONG_APP` error (`details[0].value`), so the screen can point to the right site. */
export function wrongAppRole(error: {
  details: readonly { field: string; value?: string }[];
}): string | null {
  return error.details.find((detail) => detail.field === 'role')?.value ?? null;
}
