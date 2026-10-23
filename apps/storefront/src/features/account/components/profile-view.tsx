'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError, unwrap } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which account pages don't have.
import { useHydrated, useSubmitFailure } from '@nile/auth-screens';
import { fields, formatDate } from '@nile/domain';
import { applyServerErrors } from '@nile/query';
import {
  Button,
  ErrorState,
  Field,
  FormAlert,
  Input,
  PageHeader,
  PhoneInput,
  Skeleton,
  toast,
} from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { browserApi } from '@/lib/browser-api';
import { accountKeys, profileQuery } from '../api';
import { PROFILE_COPY } from '../copy';
import {
  hasChanges,
  profilePatch,
  profileSchema,
  profileValues,
  type Profile,
  type ProfilePatch,
  type ProfileValues,
} from '../schemas';

const FIELD_MAP = {
  firstName: { field: 'firstName', message: fields.FIELD_MESSAGES.tooLong(100) },
  lastName: { field: 'lastName', message: fields.FIELD_MESSAGES.tooLong(100) },
  phone: { field: 'phone', message: fields.FIELD_MESSAGES.egPhone },
} as const;

async function updateProfile(body: ProfilePatch): Promise<Profile> {
  return (await unwrap(browserApi.PATCH('/api/v1/me', { body }))).data;
}

/** SF-15 Profile: `GET /me`, then the edit form. */
export function ProfileView() {
  const profile = useQuery(profileQuery());

  if (profile.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={PROFILE_COPY.title} />
        <ErrorState
          message={PROFILE_COPY.loadFailed}
          onRetry={() => void profile.refetch()}
          correlationId={isApiError(profile.error) ? (profile.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (profile.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <PageHeader title={PROFILE_COPY.title} />
        <Skeleton className="h-64 max-w-xl" />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader title={PROFILE_COPY.title} />
      <ProfileForm profile={profile.data} />
    </div>
  );
}

function ProfileForm({ profile }: { readonly profile: Profile }) {
  const queryClient = useQueryClient();
  const failure = useSubmitFailure();
  const hydrated = useHydrated();
  const form = useForm<ProfileValues, unknown, z.output<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    mode: 'onBlur',
    defaultValues: profileValues(profile),
  });
  const changed = hasChanges(useWatch({ control: form.control }) as ProfileValues, profile);

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    const patch = profilePatch(values, profile);
    if (patch === null) return;
    try {
      const updated = await updateProfile(patch);
      // The header greeting reads the same query (design 02 §3.1: set `me.profile`).
      queryClient.setQueryData(accountKeys.profile(), updated);
      form.reset(profileValues(updated));
      toast({ title: PROFILE_COPY.saved });
    } catch (error) {
      if (!applyServerErrors(error, form.setError, FIELD_MAP)) failure.fail(error);
    }
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="max-w-xl space-y-4">
      {failure.message === null ? null : (
        <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
      )}
      <dl className="space-y-1 text-sm">
        <dt className="font-medium">{PROFILE_COPY.email}</dt>
        <dd>{profile.email}</dd>
        <dd className="text-muted-foreground">{PROFILE_COPY.emailFixed}</dd>
      </dl>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          control={form.control}
          name="firstName"
          label={PROFILE_COPY.firstName}
          required
          render={({ field, controlProps }) => (
            <Input {...field} {...controlProps} autoComplete="given-name" />
          )}
        />
        <Field
          control={form.control}
          name="lastName"
          label={PROFILE_COPY.lastName}
          required
          render={({ field, controlProps }) => (
            <Input {...field} {...controlProps} autoComplete="family-name" />
          )}
        />
      </div>
      <Field
        control={form.control}
        name="phone"
        label={PROFILE_COPY.phone}
        required
        render={({ field, controlProps }) => <PhoneInput {...field} {...controlProps} />}
      />
      <p className="text-sm text-muted-foreground">
        {PROFILE_COPY.memberSince(formatDate(profile.createdAt))}
      </p>
      <Button
        type="submit"
        loading={form.formState.isSubmitting}
        disabled={!hydrated || !changed || failure.blocked}
      >
        {PROFILE_COPY.save}
      </Button>
    </form>
  );
}
