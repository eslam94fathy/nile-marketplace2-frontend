import { safeReturnTo } from '@nile/auth/server';
import {
  AUTH_PATHS,
  CODE_SENT_PARAM,
  CODE_SENT_VALUE,
  EMAIL_PARAM,
  NOTICE_PARAM,
  NOTICES,
  RETURN_TO_PARAM,
  type Notice,
} from './routes';

// Reading the sign-in screens' query parameters on the server (Next.js 16: `searchParams` is a promise of
// string | string[] | undefined per key). Anything unexpected is treated as absent.

export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

export function firstParam(params: SearchParams, name: string): string | null {
  const value = params[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined || first === '' ? null : first;
}

/** `returnTo` when it is a safe same-site path (never a sign-in screen), else null (conventions §2). */
export function returnToParam(params: SearchParams): string | null {
  return safeReturnTo(firstParam(params, RETURN_TO_PARAM), { exclude: AUTH_PATHS });
}

const MAX_EMAIL_PARAM_LENGTH = 254;

/** The `email` prefill, trimmed; never validated here (the form does that). */
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
