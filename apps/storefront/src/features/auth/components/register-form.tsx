'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
import { AUTH_COPY, AuthCard, FailureAlert, useSubmitFailure, useHydrated } from '@nile/auth-screens';
import { CODE_SENT_PARAM, CODE_SENT_VALUE, EMAIL_PARAM } from '@nile/auth-screens/params';
import { fields } from '@nile/domain';
import { applyServerErrors } from '@nile/query';
import { Button, Field, Input, PasswordInput, PhoneInput } from '@nile/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type * as z from 'zod';
import { RETURN_TO_PARAM, ROUTES } from '@/lib/routes';
import { registerCustomer } from '../api';
import { REGISTER_COPY } from '../copy';
import { registerSchema, toRegisterBody, type RegisterValues } from '../schemas';

const FIELD_MAP = {
  firstName: { field: 'firstName', message: fields.FIELD_MESSAGES.tooLong(100) },
  lastName: { field: 'lastName', message: fields.FIELD_MESSAGES.tooLong(100) },
  email: { field: 'email', message: fields.FIELD_MESSAGES.email },
  phone: { field: 'phone', message: fields.FIELD_MESSAGES.egPhone },
  password: { field: 'password', message: fields.FIELD_MESSAGES.passwordTooShort },
} as const;

const LINK = 'font-medium text-primary underline-offset-4 hover:underline';

/** SF-11 Create account: no session until the email is verified (SF-12). */
export function RegisterForm({ returnTo }: { readonly returnTo: string | null }) {
  const router = useRouter();
  const failure = useSubmitFailure();
  const hydrated = useHydrated();
  /** The normalised email that is already registered, for the sign-in and reset links. */
  const [takenEmail, setTakenEmail] = useState<string | null>(null);
  const form = useForm<RegisterValues, unknown, z.output<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
    defaultValues: { firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '' },
  });
  const keepReturnTo = returnTo === null ? {} : { [RETURN_TO_PARAM]: returnTo };

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    setTakenEmail(null);
    try {
      await registerCustomer(toRegisterBody(values));
      router.push(
        `${ROUTES.verifyEmail}?${new URLSearchParams({
          [EMAIL_PARAM]: values.email,
          [CODE_SENT_PARAM]: CODE_SENT_VALUE,
          ...keepReturnTo,
        }).toString()}`,
      );
    } catch (error) {
      if (isApiError(error, 'EMAIL_ALREADY_REGISTERED')) {
        form.setError('email', { type: 'server', message: AUTH_COPY.errors.EMAIL_ALREADY_REGISTERED });
        setTakenEmail(values.email);
        return;
      }
      if (!applyServerErrors(error, form.setError, FIELD_MAP)) failure.fail(error);
    }
  });

  return (
    <AuthCard title={REGISTER_COPY.title}>
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-4">
        <FailureAlert failure={failure} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            control={form.control}
            name="firstName"
            label={REGISTER_COPY.firstName}
            required
            render={({ field, controlProps }) => (
              <Input {...field} {...controlProps} autoComplete="given-name" />
            )}
          />
          <Field
            control={form.control}
            name="lastName"
            label={REGISTER_COPY.lastName}
            required
            render={({ field, controlProps }) => (
              <Input {...field} {...controlProps} autoComplete="family-name" />
            )}
          />
        </div>
        <Field
          control={form.control}
          name="email"
          label={AUTH_COPY.fields.email}
          required
          render={({ field, controlProps }) => (
            <Input {...field} {...controlProps} type="email" autoComplete="email" inputMode="email" />
          )}
        />
        {takenEmail !== null ? (
          <p className="flex gap-4 text-sm">
            <Link
              href={{ pathname: ROUTES.login, query: { [EMAIL_PARAM]: takenEmail, ...keepReturnTo } }}
              className={LINK}
            >
              {REGISTER_COPY.signIn}
            </Link>
            <Link
              href={{ pathname: ROUTES.forgotPassword, query: { [EMAIL_PARAM]: takenEmail } }}
              className={LINK}
            >
              {REGISTER_COPY.forgotPassword}
            </Link>
          </p>
        ) : null}
        <Field
          control={form.control}
          name="phone"
          label={REGISTER_COPY.phone}
          required
          render={({ field, controlProps }) => <PhoneInput {...field} {...controlProps} />}
        />
        <Field
          control={form.control}
          name="password"
          label={AUTH_COPY.fields.password}
          description={AUTH_COPY.passwordHint}
          required
          render={({ field, controlProps }) => (
            <PasswordInput {...field} {...controlProps} autoComplete="new-password" />
          )}
        />
        <Field
          control={form.control}
          name="confirmPassword"
          label={AUTH_COPY.fields.confirmPassword}
          required
          render={({ field, controlProps }) => (
            <PasswordInput {...field} {...controlProps} autoComplete="new-password" />
          )}
        />
        <Button
          type="submit"
          className="w-full"
          loading={form.formState.isSubmitting}
          disabled={!hydrated || failure.blocked}
        >
          {REGISTER_COPY.submit}
        </Button>
      </form>
      <p className="text-sm">
        {REGISTER_COPY.haveAccount}{' '}
        <Link href={{ pathname: ROUTES.login, query: keepReturnTo }} className={LINK}>
          {REGISTER_COPY.signIn}
        </Link>
      </p>
    </AuthCard>
  );
}
