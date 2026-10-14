import { safeReturnTo } from '@nile/auth/client';

// Query parameters of the sign-in screens (spec 01 SF-10…SF-14) and their server-side readers. No React:
// pages (Server Components) read and validate them, then pass plain values to the forms.

export const RETURN_TO_PARAM = 'returnTo';
export const EMAIL_PARAM = 'email';
export const NOTICE_PARAM = 'notice';
/**
 * Set by the screen that just made the backend email a code (registration, forgot password), so the next
 * screen starts the 60 s resend cooldown; removed from the address bar once read (decided 2026-10-14).
 */
export const CODE_SENT_PARAM = 'sent';
export const CODE_SENT_VALUE = '1';

/** `notice` values shown on arrival (spec 01 SF-10, SF-12; spec 03/04 `invited` arrives with T-D6). */
export const NOTICES = {
  passwordReset: 'password-reset',
  sessionEnded: 'session-ended',
  emailNotVerified: 'email-not-verified',
} as const;
export type Notice = (typeof NOTICES)[keyof typeof NOTICES];

/** Next.js 16 page `searchParams`: string | string[] | undefined per key. */
export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

export function firstParam(params: SearchParams, name: string): string | null {
  const value = params[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined || first === '' ? null : first;
}

/** `returnTo` when it is a safe same-site path and not one of `authPaths`, else null (conventions §2). */
export function returnToParam(params: SearchParams, authPaths: readonly string[]): string | null {
  return safeReturnTo(firstParam(params, RETURN_TO_PARAM), { exclude: authPaths });
}

const MAX_EMAIL_PARAM_LENGTH = 254;

/** The `email` prefill, trimmed; validated by the form, not here. */
export function emailParam(params: SearchParams): string | null {
  const email = firstParam(params, EMAIL_PARAM)?.trim() ?? null;
  return email === null || email === '' || email.length > MAX_EMAIL_PARAM_LENGTH ? null : email;
}

const NOTICE_VALUES: readonly string[] = Object.values(NOTICES);

export function noticeParam(params: SearchParams): Notice | null {
  const notice = firstParam(params, NOTICE_PARAM);
  return notice !== null && NOTICE_VALUES.includes(notice) ? (notice as Notice) : null;
}

export function codeSentParam(params: SearchParams): boolean {
  return firstParam(params, CODE_SENT_PARAM) === CODE_SENT_VALUE;
}
