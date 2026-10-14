'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
import { fields } from '@nile/domain';
import { applyServerErrors } from '@nile/query';
import { Button, Field, Input, Notice, PasswordInput, toast, useCooldown } from '@nile/ui';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useAuthScreens, withQuery } from '../config';
import { AUTH_COPY } from '../copy';
import { RESEND_COOLDOWN_SECONDS } from '../constants';
import { dropQueryParam, loadPage } from '../navigation';
import { CODE_SENT_PARAM, EMAIL_PARAM, NOTICE_PARAM, NOTICES } from '../params';
import { resetPasswordSchema, toResetBody, type ResetPasswordValues } from '../schemas';
import { useSubmitFailure } from '../submit-failure';
import { AuthCard } from './auth-card';
import { FailureAlert } from './failure-alert';

const FIELD_MAP = {
  email: { field: 'email', message: fields.FIELD_MESSAGES.email },
  otp: { field: 'otp', message: fields.FIELD_MESSAGES.otp },
  newPassword: { field: 'password', message: fields.FIELD_MESSAGES.passwordTooShort },
} as const;

export interface ResetPasswordFormProps {
  readonly email: string | null;
  /** Arrived from SF-13, which just sent a code: show its notice and start the cooldown. */
  readonly codeSent: boolean;
}

/** Reset password (spec 01 SF-14, spec 02 SE-05, admin/agent sign-in): every session ends, so the customer signs in again afterwards. */
export function ResetPasswordForm({ email, codeSent }: ResetPasswordFormProps) {
  const { routes, api } = useAuthScreens();
  const failure = useSubmitFailure();
  const newCodeFailure = useSubmitFailure();
  const cooldown = useCooldown();
  const startCooldown = cooldown.start;
  const form = useForm<ResetPasswordValues, unknown, z.output<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onBlur',
    defaultValues: { email: email ?? '', otp: '', password: '', confirmPassword: '' },
  });

  useEffect(() => {
    if (!codeSent) return;
    startCooldown(RESEND_COOLDOWN_SECONDS);
    dropQueryParam(CODE_SENT_PARAM);
  }, [codeSent, startCooldown]);

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    try {
      await api.resetPassword(toResetBody(values));
      loadPage(
        withQuery(routes.login, { [NOTICE_PARAM]: NOTICES.passwordReset, [EMAIL_PARAM]: values.email }),
      );
    } catch (error) {
      if (isApiError(error, 'INVALID_OTP')) {
        form.setError('otp', { type: 'server', message: AUTH_COPY.errors.INVALID_OTP });
        return;
      }
      if (!applyServerErrors(error, form.setError, FIELD_MAP)) failure.fail(error);
    }
  });

  const sendNewCode = async () => {
    newCodeFailure.clear();
    if (!(await form.trigger('email'))) return;
    try {
      await api.requestPasswordReset(fields.email.parse(form.getValues('email')));
      toast({ title: AUTH_COPY.reset.sent, tone: 'success' });
      cooldown.start(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      newCodeFailure.fail(error);
    }
  };

  const waiting = cooldown.remaining > 0 || newCodeFailure.blocked;

  return (
    <AuthCard title={AUTH_COPY.reset.title}>
      {codeSent ? <Notice>{AUTH_COPY.reset.sent}</Notice> : null}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-4">
        <FailureAlert failure={failure} />
        <FailureAlert failure={newCodeFailure} />
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
          disabled={failure.blocked}
        >
          {AUTH_COPY.reset.submit}
        </Button>
      </form>
      <Button variant="link" className="px-0" disabled={waiting} onClick={() => void sendNewCode()}>
        {cooldown.remaining > 0 ? AUTH_COPY.reset.newCodeIn(cooldown.remaining) : AUTH_COPY.reset.newCode}
      </Button>
    </AuthCard>
  );
}
