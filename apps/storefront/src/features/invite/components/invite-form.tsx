'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
import { acceptInvite } from '@nile/auth/client';
import {
  AUTH_COPY,
  AuthCard,
  FailureAlert,
  confirmationMatches,
  useSubmitFailure,
  useHydrated,
} from '@nile/auth-screens';
import { EMAIL_PARAM, NOTICE_PARAM, NOTICES } from '@nile/auth-screens/params';
import { fields } from '@nile/domain';
import { applyServerErrors } from '@nile/query';
import { Button, Field, FormAlert, PasswordInput } from '@nile/ui';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { publicEnv } from '@/lib/env/public';
import { INVITE_COPY } from '../copy';
import { goToSignIn } from '../lib/navigation';

/** The emailed link carries a 43-character token (`INVITE_URL_BASE?token=…`, api-inventory §2.3). */
const INVITE_TOKEN_LENGTH = 43;
const TOKEN_PARAM = 'token';

const inviteSchema = z
  .object({ password: fields.password, confirmPassword: z.string() })
  .refine(confirmationMatches.check, confirmationMatches.issue);
type InviteValues = z.input<typeof inviteSchema>;

const FIELD_MAP = {
  password: { field: 'password', message: fields.FIELD_MESSAGES.passwordTooShort },
} as const;

/** Where each invited role signs in (spec 01 SF-20: app URLs from config). */
const SIGN_IN_URLS: Readonly<Record<string, string>> = {
  admin: `${publicEnv.NEXT_PUBLIC_ADMIN_URL}/login`,
  delivery_agent: `${publicEnv.NEXT_PUBLIC_AGENT_URL}/login`,
};

type TokenState = { kind: 'reading' } | { kind: 'invalid' } | { kind: 'ready'; token: string };

/** Reads the token once in the browser and removes it from the address bar (architecture §9.7). */
function readTokenFromAddress(): TokenState {
  const url = new URL(window.location.href);
  const token = url.searchParams.get(TOKEN_PARAM);
  if (token !== null) {
    url.searchParams.delete(TOKEN_PARAM);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return token?.length === INVITE_TOKEN_LENGTH ? { kind: 'ready', token } : { kind: 'invalid' };
}

/**
 * SF-20 Invite landing for admins and delivery agents: set a password, then sign in to the right app. The
 * storefront keeps no session for them (the BFF revokes it at once).
 */
export function InviteForm() {
  const [token, setToken] = useState<TokenState>({ kind: 'reading' });
  const failure = useSubmitFailure({ INVALID_INVITE_TOKEN: INVITE_COPY.expired });
  const hydrated = useHydrated();
  const form = useForm<InviteValues, unknown, z.output<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    mode: 'onBlur',
    defaultValues: { password: '', confirmPassword: '' },
  });

  useEffect(() => {
    // Read once after hydration: the token must not be part of the server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the address bar is browser-only
    setToken(readTokenFromAddress());
  }, []);

  const onSubmit = form.handleSubmit(async (values) => {
    if (token.kind !== 'ready') return;
    failure.clear();
    try {
      const { role, email } = await acceptInvite({ token: token.token, password: values.password });
      const signInUrl = SIGN_IN_URLS[role];
      if (signInUrl === undefined) {
        failure.fail(new Error('unexpected role'));
        return;
      }
      const query = new URLSearchParams({ [NOTICE_PARAM]: NOTICES.invited, [EMAIL_PARAM]: email });
      goToSignIn(`${signInUrl}?${query.toString()}`);
    } catch (error) {
      if (isApiError(error, 'INVALID_INVITE_TOKEN')) {
        failure.fail(error);
        return;
      }
      if (!applyServerErrors(error, form.setError, FIELD_MAP)) failure.fail(error);
    }
  });

  if (token.kind === 'reading') return <AuthCard title={INVITE_COPY.title}>{null}</AuthCard>;
  if (token.kind === 'invalid') {
    return (
      <AuthCard title={INVITE_COPY.title}>
        <FormAlert>{INVITE_COPY.invalidLink}</FormAlert>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={INVITE_COPY.title}>
      <p className="text-sm">{INVITE_COPY.intro}</p>
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-4">
        <FailureAlert failure={failure} />
        <Field
          control={form.control}
          name="password"
          label={AUTH_COPY.fields.newPassword}
          description={AUTH_COPY.passwordHint}
          required
          render={({ field, controlProps }) => (
            <PasswordInput {...field} {...controlProps} autoComplete="new-password" />
          )}
        />
        <Field
          control={form.control}
          name="confirmPassword"
          label={AUTH_COPY.fields.confirmNewPassword}
          required
          render={({ field, controlProps }) => (
            <PasswordInput {...field} {...controlProps} autoComplete="new-password" />
          )}
        />
        <Button
          type="submit"
          className="w-full"
          loading={form.formState.isSubmitting}
          disabled={!hydrated || failure.blocked || isApiError(failure.error, 'INVALID_INVITE_TOKEN')}
        >
          {INVITE_COPY.submit}
        </Button>
      </form>
    </AuthCard>
  );
}
