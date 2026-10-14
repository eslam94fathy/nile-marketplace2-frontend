'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
import { signIn } from '@nile/auth/client';
import { applyServerErrors } from '@nile/query';
import { Button, Field, Input, Notice, PasswordInput } from '@nile/ui';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { useAuthScreens, withQuery } from '../config';
import { AUTH_COPY } from '../copy';
import { destinationAfterSignIn, loadPage } from '../navigation';
import { EMAIL_PARAM, NOTICE_PARAM, NOTICES, RETURN_TO_PARAM, type Notice as NoticeValue } from '../params';
import { signInSchema, type SignInValues } from '../schemas';
import { useSubmitFailure } from '../submit-failure';
import { AuthCard } from './auth-card';
import { FailureAlert } from './failure-alert';

const ERRORS = {
  INVALID_CREDENTIALS: AUTH_COPY.errors.INVALID_CREDENTIALS,
  ACCOUNT_SUSPENDED: AUTH_COPY.errors.ACCOUNT_SUSPENDED,
};

const FIELD_MAP = {
  email: { field: 'email', message: AUTH_COPY.fields.email },
  password: { field: 'password', message: AUTH_COPY.fields.password },
} as const;

const LINK = 'text-primary underline-offset-4 hover:underline';

export interface SignInFormProps {
  readonly returnTo: string | null;
  readonly email: string | null;
  readonly notice: NoticeValue | null;
}

/** Sign in (spec 01 SF-10, spec 02 SE-01, spec 03 AD-01, spec 04 AG-01). */
export function SignInForm({ returnTo, email, notice }: SignInFormProps) {
  const { routes, authPaths, navigate, Link } = useAuthScreens();
  const failure = useSubmitFailure(ERRORS);
  const form = useForm<SignInValues, unknown, z.output<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    mode: 'onBlur',
    defaultValues: { email: email ?? '', password: '' },
  });
  const typedEmail = useWatch({ control: form.control, name: 'email' });

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    try {
      await signIn(values);
      loadPage(destinationAfterSignIn(returnTo, authPaths, routes.home));
    } catch (error) {
      if (isApiError(error, 'EMAIL_NOT_VERIFIED') && routes.verifyEmail !== undefined) {
        navigate(
          withQuery(routes.verifyEmail, {
            [EMAIL_PARAM]: values.email,
            [NOTICE_PARAM]: NOTICES.emailNotVerified,
            [RETURN_TO_PARAM]: returnTo,
          }),
        );
        return;
      }
      if (!applyServerErrors(error, form.setError, FIELD_MAP)) failure.fail(error);
    }
  });

  return (
    <AuthCard title={AUTH_COPY.signIn.title}>
      {notice === NOTICES.passwordReset || notice === NOTICES.sessionEnded ? (
        <Notice tone={notice === NOTICES.passwordReset ? 'success' : 'info'}>
          {AUTH_COPY.notices[notice]}
        </Notice>
      ) : null}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-4">
        <FailureAlert failure={failure} />
        <Field
          control={form.control}
          name="email"
          label={AUTH_COPY.fields.email}
          required
          render={({ field, controlProps }) => (
            <Input {...field} {...controlProps} type="email" autoComplete="email" inputMode="email" />
          )}
        />
        <Field
          control={form.control}
          name="password"
          label={AUTH_COPY.fields.password}
          required
          render={({ field, controlProps }) => (
            <PasswordInput {...field} {...controlProps} autoComplete="current-password" />
          )}
        />
        <Button
          type="submit"
          className="w-full"
          loading={form.formState.isSubmitting}
          disabled={failure.blocked}
        >
          {AUTH_COPY.signIn.submit}
        </Button>
      </form>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link href={withQuery(routes.forgotPassword, { [EMAIL_PARAM]: typedEmail })} className={LINK}>
          {AUTH_COPY.signIn.forgotPassword}
        </Link>
        {routes.register === undefined ? null : (
          <p>
            {AUTH_COPY.signIn.noAccount}{' '}
            <Link
              href={withQuery(routes.register, { [RETURN_TO_PARAM]: returnTo })}
              className={`font-medium ${LINK}`}
            >
              {AUTH_COPY.signIn.createAccount}
            </Link>
          </p>
        )}
      </div>
    </AuthCard>
  );
}
