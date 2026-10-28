'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
import { verifyEmailAndSignIn } from '@nile/auth/client';
import { fields } from '@nile/domain';
import { applyServerErrors } from '@nile/query';
import { Button, Field, Input, Notice, toast, useCooldown } from '@nile/ui';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import type * as z from 'zod';
import { useAuthScreens, withQuery } from '../config';
import { AUTH_COPY } from '../copy';
import { RESEND_COOLDOWN_SECONDS } from '../constants';
import { destinationAfterSignIn, dropQueryParam, loadPage } from '../navigation';
import { CODE_SENT_PARAM, NOTICES, RETURN_TO_PARAM, type Notice as NoticeValue } from '../params';
import { verifyEmailSchema, type VerifyEmailValues } from '../schemas';
import { useSubmitFailure } from '../submit-failure';
import { useHydrated } from '../use-hydrated';
import { AuthCard } from './auth-card';
import { FailureAlert } from './failure-alert';

const FIELD_MAP = {
  email: { field: 'email', message: fields.FIELD_MESSAGES.email },
  otp: { field: 'otp', message: fields.FIELD_MESSAGES.otp },
} as const;

export interface VerifyEmailFormProps {
  /** From the address; when missing, the screen asks for it first (spec 01 SF-12). */
  readonly email: string | null;
  readonly returnTo: string | null;
  readonly notice: NoticeValue | null;
  /** A code was just sent (registration): start the resend cooldown. */
  readonly codeSent: boolean;
}

/** Verify email (spec 01 SF-12, spec 02 SE-03): the code signs the user in. Never states whether the email exists. */
export function VerifyEmailForm({ email, returnTo, notice, codeSent }: VerifyEmailFormProps) {
  const { routes, authPaths, api, Link, verifyNote } = useAuthScreens();
  const failure = useSubmitFailure();
  const hydrated = useHydrated();
  const resendFailure = useSubmitFailure();
  const cooldown = useCooldown();
  const startCooldown = cooldown.start;
  const form = useForm<VerifyEmailValues, unknown, z.output<typeof verifyEmailSchema>>({
    resolver: zodResolver(verifyEmailSchema),
    mode: 'onBlur',
    defaultValues: { email: email ?? '', otp: '' },
  });

  useEffect(() => {
    if (!codeSent) return;
    startCooldown(RESEND_COOLDOWN_SECONDS);
    dropQueryParam(CODE_SENT_PARAM);
  }, [codeSent, startCooldown]);

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    try {
      await verifyEmailAndSignIn(values);
      loadPage(destinationAfterSignIn(returnTo, authPaths, routes.home));
    } catch (error) {
      if (isApiError(error, 'INVALID_OTP')) {
        form.setError('otp', { type: 'server', message: AUTH_COPY.errors.INVALID_OTP });
        return;
      }
      if (!applyServerErrors(error, form.setError, FIELD_MAP)) failure.fail(error);
    }
  });

  const resend = async () => {
    resendFailure.clear();
    const resendCode = api.resendVerificationCode;
    if (resendCode === undefined || !(await form.trigger('email'))) return;
    try {
      await resendCode(fields.email.parse(form.getValues('email')));
      toast({ title: AUTH_COPY.verify.resent, tone: 'success' });
      cooldown.start(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      resendFailure.fail(error);
    }
  };

  const waiting = cooldown.remaining > 0 || resendFailure.blocked;

  return (
    <AuthCard title={AUTH_COPY.verify.title}>
      {notice === NOTICES.emailNotVerified ? <Notice>{AUTH_COPY.notices[notice]}</Notice> : null}
      {email === null ? null : (
        <p className="text-sm">
          {codeSent ? AUTH_COPY.verify.sentTo(email) : AUTH_COPY.verify.requestCode(email)}
        </p>
      )}
      {codeSent && verifyNote !== undefined ? <p className="text-sm">{verifyNote}</p> : null}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-4">
        <FailureAlert failure={failure} />
        <FailureAlert failure={resendFailure} />
        {email === null ? (
          <Field
            control={form.control}
            name="email"
            label={AUTH_COPY.fields.email}
            required
            render={({ field, controlProps }) => (
              <Input {...field} {...controlProps} type="email" autoComplete="email" inputMode="email" />
            )}
          />
        ) : null}
        <Field
          control={form.control}
          name="otp"
          label={AUTH_COPY.fields.code}
          required
          render={({ field, controlProps }) => (
            <Input
              {...field}
              {...controlProps}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="tracking-widest"
            />
          )}
        />
        <Button
          type="submit"
          className="w-full"
          loading={form.formState.isSubmitting}
          disabled={!hydrated || failure.blocked}
        >
          {AUTH_COPY.verify.submit}
        </Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Button variant="link" className="px-0" disabled={waiting} onClick={() => void resend()}>
          {cooldown.remaining > 0 ? AUTH_COPY.verify.resendIn(cooldown.remaining) : AUTH_COPY.verify.resend}
        </Button>
        {routes.register === undefined ? null : (
          <Link
            href={withQuery(routes.register, { [RETURN_TO_PARAM]: returnTo })}
            className="text-primary underline-offset-4 hover:underline"
          >
            {AUTH_COPY.verify.changeEmail}
          </Link>
        )}
      </div>
    </AuthCard>
  );
}
