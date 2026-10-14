'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { fields } from '@nile/domain';
import { applyServerErrors } from '@nile/query';
import { Button, Field, Input } from '@nile/ui';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useAuthScreens, withQuery } from '../config';
import { AUTH_COPY } from '../copy';
import { CODE_SENT_PARAM, CODE_SENT_VALUE, EMAIL_PARAM } from '../params';
import { emailOnlySchema, type EmailOnlyValues } from '../schemas';
import { useSubmitFailure } from '../submit-failure';
import { AuthCard } from './auth-card';
import { FailureAlert } from './failure-alert';

const FIELD_MAP = { email: { field: 'email', message: fields.FIELD_MESSAGES.email } } as const;

/** SF-13 Forgot password: always the same answer, then the reset screen (never reveals if the email exists). */
export function ForgotPasswordForm({ email }: { readonly email: string | null }) {
  const { routes, api, navigate } = useAuthScreens();
  const failure = useSubmitFailure();
  const form = useForm<EmailOnlyValues, unknown, z.output<typeof emailOnlySchema>>({
    resolver: zodResolver(emailOnlySchema),
    mode: 'onBlur',
    defaultValues: { email: email ?? '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    try {
      await api.requestPasswordReset(values.email);
      navigate(
        withQuery(routes.resetPassword, { [EMAIL_PARAM]: values.email, [CODE_SENT_PARAM]: CODE_SENT_VALUE }),
      );
    } catch (error) {
      if (!applyServerErrors(error, form.setError, FIELD_MAP)) failure.fail(error);
    }
  });

  return (
    <AuthCard title={AUTH_COPY.forgot.title}>
      <p className="text-sm">{AUTH_COPY.forgot.intro}</p>
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
        <Button
          type="submit"
          className="w-full"
          loading={form.formState.isSubmitting}
          disabled={failure.blocked}
        >
          {AUTH_COPY.forgot.submit}
        </Button>
      </form>
    </AuthCard>
  );
}
