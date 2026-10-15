'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
import { AUTH_COPY, AuthCard, FailureAlert, useSubmitFailure, useHydrated } from '@nile/auth-screens';
import { CODE_SENT_PARAM, CODE_SENT_VALUE, EMAIL_PARAM } from '@nile/auth-screens/params';
import { fields } from '@nile/domain';
import { applyServerErrors, governoratesQuery } from '@nile/query';
import { Button, Field, FormAlert, Input, PasswordInput, PhoneInput, Select, UI_COPY } from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { browserApi } from '@/lib/browser-api';
import { ROUTES } from '@/lib/routes';
import { registerSeller } from '../api';
import { REGISTER_COPY } from '../copy';
import { registerSellerSchema, toRegisterSellerBody, type RegisterSellerValues } from '../schemas';

const FIELD_MAP = {
  businessName: { field: 'businessName', message: fields.FIELD_MESSAGES.tooLong(150) },
  contactPhone: { field: 'contactPhone', message: fields.FIELD_MESSAGES.egPhone },
  email: { field: 'email', message: fields.FIELD_MESSAGES.email },
  password: { field: 'password', message: fields.FIELD_MESSAGES.passwordTooShort },
  'pickupAddress.governorateId': { field: 'governorateId', message: fields.FIELD_MESSAGES.required },
  'pickupAddress.city': { field: 'city', message: fields.FIELD_MESSAGES.tooLong(100) },
  'pickupAddress.area': { field: 'area', message: fields.FIELD_MESSAGES.tooLong(100) },
  'pickupAddress.street': { field: 'street', message: fields.FIELD_MESSAGES.tooLong(200) },
  'pickupAddress.building': { field: 'building', message: fields.FIELD_MESSAGES.tooLong(50) },
  'pickupAddress.landmark': { field: 'landmark', message: fields.FIELD_MESSAGES.tooLong(200) },
} as const;

const LINK = 'font-medium text-primary underline-offset-4 hover:underline';

const TEXT_FIELDS = [
  { name: 'city', label: REGISTER_COPY.city, autoComplete: 'address-level2', required: true },
  { name: 'area', label: REGISTER_COPY.area, autoComplete: 'address-level3', required: true },
  { name: 'street', label: REGISTER_COPY.street, autoComplete: 'address-line1', required: true },
  { name: 'building', label: REGISTER_COPY.building, autoComplete: 'address-line2', required: true },
  { name: 'landmark', label: REGISTER_COPY.landmark, autoComplete: 'off', required: false },
] as const;

/** SE-02 Register: no session until the email is verified (SE-03); then an admin reviews the application. */
export function RegisterSellerForm() {
  const router = useRouter();
  const failure = useSubmitFailure();
  const hydrated = useHydrated();
  const governorates = useQuery(governoratesQuery(browserApi));
  const [takenEmail, setTakenEmail] = useState<string | null>(null);
  const form = useForm<RegisterSellerValues, unknown, z.output<typeof registerSellerSchema>>({
    resolver: zodResolver(registerSellerSchema),
    mode: 'onBlur',
    defaultValues: {
      businessName: '',
      contactPhone: '',
      email: '',
      password: '',
      confirmPassword: '',
      governorateId: '',
      city: '',
      area: '',
      street: '',
      building: '',
      landmark: '',
    },
  });
  const governorateOptions = (governorates.data ?? []).map((g) => ({ value: g.id, label: g.name }));

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    setTakenEmail(null);
    try {
      await registerSeller(toRegisterSellerBody(values));
      const query = new URLSearchParams({ [EMAIL_PARAM]: values.email, [CODE_SENT_PARAM]: CODE_SENT_VALUE });
      router.push(`${ROUTES.verifyEmail}?${query.toString()}`);
    } catch (error) {
      if (isApiError(error, 'EMAIL_ALREADY_REGISTERED')) {
        form.setError('email', { type: 'server', message: AUTH_COPY.errors.EMAIL_ALREADY_REGISTERED });
        setTakenEmail(values.email);
        return;
      }
      if (isApiError(error, 'BUSINESS_NAME_TAKEN')) {
        form.setError('businessName', { type: 'server', message: REGISTER_COPY.errors.BUSINESS_NAME_TAKEN });
        return;
      }
      if (isApiError(error, 'GOVERNORATE_NOT_FOUND')) {
        void governorates.refetch();
        form.setError('governorateId', {
          type: 'server',
          message: REGISTER_COPY.errors.GOVERNORATE_NOT_FOUND,
        });
        return;
      }
      if (!applyServerErrors(error, form.setError, FIELD_MAP)) failure.fail(error);
    }
  });

  return (
    <AuthCard title={REGISTER_COPY.title}>
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-4">
        <FailureAlert failure={failure} />
        <Field
          control={form.control}
          name="businessName"
          label={REGISTER_COPY.businessName}
          required
          render={({ field, controlProps }) => (
            <Input {...field} {...controlProps} autoComplete="organization" />
          )}
        />
        <Field
          control={form.control}
          name="contactPhone"
          label={REGISTER_COPY.contactPhone}
          required
          render={({ field, controlProps }) => <PhoneInput {...field} {...controlProps} />}
        />
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
            <Link href={{ pathname: ROUTES.login, query: { [EMAIL_PARAM]: takenEmail } }} className={LINK}>
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
        <fieldset className="space-y-4">
          <legend className="text-base font-semibold">{REGISTER_COPY.pickupAddress}</legend>
          <p className="text-sm text-muted-foreground">{REGISTER_COPY.pickupHelp}</p>
          {governorates.isError ? (
            <FormAlert>
              {REGISTER_COPY.governoratesFailed}{' '}
              <Button variant="link" className="h-auto px-0" onClick={() => void governorates.refetch()}>
                {UI_COPY.tryAgain}
              </Button>
            </FormAlert>
          ) : null}
          <Field
            control={form.control}
            name="governorateId"
            label={REGISTER_COPY.governorate}
            required
            render={({ field, controlProps }) => (
              <Select
                {...controlProps}
                options={governorateOptions}
                placeholder={REGISTER_COPY.governoratePlaceholder}
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                disabled={governorates.isPending}
              />
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {TEXT_FIELDS.map((item) => (
              <Field
                key={item.name}
                control={form.control}
                name={item.name}
                label={item.label}
                required={item.required}
                render={({ field, controlProps }) => (
                  <Input {...field} {...controlProps} autoComplete={item.autoComplete} />
                )}
              />
            ))}
          </div>
        </fieldset>
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
        <Link href={ROUTES.login} className={LINK}>
          {REGISTER_COPY.signIn}
        </Link>
      </p>
    </AuthCard>
  );
}
