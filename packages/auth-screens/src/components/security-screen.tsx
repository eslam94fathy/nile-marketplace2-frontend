'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
import { changePassword, type SessionClient } from '@nile/auth/client';
import { fields } from '@nile/domain';
import { applyServerErrors } from '@nile/query';
import { Button, Field, FormAlert, PageHeader, PasswordInput, toast, UI_COPY } from '@nile/ui';
import { LogOut } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AUTH_COPY } from '../copy';
import { confirmationMatches } from '../schemas';
import { useSubmitFailure } from '../submit-failure';
import { useHydrated } from '../use-hydrated';

const changePasswordSchema = z
  .object({
    currentPassword: fields.currentPassword,
    password: fields.password,
    confirmPassword: z.string(),
  })
  .refine(confirmationMatches.check, confirmationMatches.issue);
type ChangePasswordValues = z.input<typeof changePasswordSchema>;

const EMPTY: ChangePasswordValues = { currentPassword: '', password: '', confirmPassword: '' };

const FIELD_MAP = {
  currentPassword: { field: 'currentPassword', message: fields.FIELD_MESSAGES.required },
  newPassword: { field: 'password', message: fields.FIELD_MESSAGES.passwordTooShort },
} as const;

export interface SecurityScreenProps {
  /** The app's session client: refreshes an expired access token, signs out. */
  readonly sessionClient: SessionClient;
}

/**
 * Security (spec 01 SF-19, spec 02 SE-17, spec 03 AD-23, spec 04 AG-08): change password, sign out. This
 * session stays signed in; every other session of the user ends (spec 03 §4.9b).
 */
export function SecurityScreen({ sessionClient }: SecurityScreenProps) {
  const failure = useSubmitFailure();
  const hydrated = useHydrated();
  const form = useForm<ChangePasswordValues, unknown, z.output<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    mode: 'onBlur',
    defaultValues: EMPTY,
  });

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    try {
      await changePassword(
        { currentPassword: values.currentPassword, newPassword: values.password },
        sessionClient.onUnauthenticated,
      );
      form.reset(EMPTY);
      toast({ title: AUTH_COPY.security.changed, tone: 'success' });
    } catch (error) {
      if (isApiError(error, 'INVALID_CURRENT_PASSWORD')) {
        form.setError('currentPassword', {
          type: 'server',
          message: AUTH_COPY.security.errors.INVALID_CURRENT_PASSWORD,
        });
        return;
      }
      if (isApiError(error, 'PASSWORD_UNCHANGED')) {
        form.setError('password', { type: 'server', message: AUTH_COPY.security.errors.PASSWORD_UNCHANGED });
        return;
      }
      if (isApiError(error, 'INVALID_REFRESH_TOKEN', 'UNAUTHENTICATED')) {
        // The session is over (conventions §2): every tab leaves for sign-in with the notice.
        await sessionClient.signOut('session-ended');
        return;
      }
      if (!applyServerErrors(error, form.setError, FIELD_MAP)) failure.fail(error);
    }
  });

  return (
    <div className="max-w-md space-y-8">
      <PageHeader title={AUTH_COPY.security.title} />
      <section aria-labelledby="change-password" className="space-y-4">
        <h2 id="change-password" className="text-lg font-semibold">
          {AUTH_COPY.security.changePassword}
        </h2>
        <p className="text-sm text-muted-foreground">{AUTH_COPY.security.note}</p>
        <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-4">
          {failure.message === null ? null : (
            <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
          )}
          <Field
            control={form.control}
            name="currentPassword"
            label={AUTH_COPY.security.currentPassword}
            required
            render={({ field, controlProps }) => (
              <PasswordInput {...field} {...controlProps} autoComplete="current-password" />
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
          <Button type="submit" loading={form.formState.isSubmitting} disabled={!hydrated || failure.blocked}>
            {AUTH_COPY.security.submit}
          </Button>
        </form>
      </section>
      <section className="border-t border-border pt-6">
        <Button
          variant="outline"
          onClick={() => {
            void sessionClient.signOut();
          }}
        >
          <LogOut aria-hidden="true" />
          {UI_COPY.signOut}
        </Button>
      </section>
    </div>
  );
}
