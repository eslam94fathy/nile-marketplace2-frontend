'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useHydrated, useSubmitFailure } from '@nile/auth-screens';
import { fields, formatDate, formatRatePercent, SELLER_STATUS_LABELS } from '@nile/domain';
import { applyServerErrors, governoratesQuery } from '@nile/query';
import {
  Button,
  ErrorState,
  Field,
  FormAlert,
  Input,
  PageHeader,
  PhoneInput,
  Select,
  SELLER_STATUS_TONES,
  Skeleton,
  StatusBadge,
  toast,
  UI_COPY,
} from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import type * as z from 'zod';
import { browserApi } from '@/lib/browser-api';
import { profileKeys, profileQuery, updateProfile, type SellerProfile } from '../api';
import { PROFILE_PAGE_COPY as COPY } from '../copy';
import { hasChanges, profilePatch, profileSchema, profileValues, type ProfileValues } from '../schemas';

const FIELD_MAP = {
  businessName: { field: 'businessName', message: fields.FIELD_MESSAGES.tooLong(150) },
  contactPhone: { field: 'contactPhone', message: fields.FIELD_MESSAGES.egPhone },
  'pickupAddress.governorateId': { field: 'governorateId', message: fields.FIELD_MESSAGES.required },
  'pickupAddress.city': { field: 'city', message: fields.FIELD_MESSAGES.tooLong(100) },
  'pickupAddress.area': { field: 'area', message: fields.FIELD_MESSAGES.tooLong(100) },
  'pickupAddress.street': { field: 'street', message: fields.FIELD_MESSAGES.tooLong(200) },
  'pickupAddress.building': { field: 'building', message: fields.FIELD_MESSAGES.tooLong(50) },
  'pickupAddress.landmark': { field: 'landmark', message: fields.FIELD_MESSAGES.tooLong(200) },
} as const;

const TEXT_FIELDS = [
  { name: 'city', label: COPY.city, autoComplete: 'address-level2', required: true },
  { name: 'area', label: COPY.area, autoComplete: 'address-level3', required: true },
  { name: 'street', label: COPY.street, autoComplete: 'address-line1', required: true },
  { name: 'building', label: COPY.building, autoComplete: 'address-line2', required: true },
  { name: 'landmark', label: COPY.landmark, autoComplete: 'off', required: false },
] as const;

/** SE-07 Profile and status: `GET /seller/profile` (shared with the header and banner), then the form. */
export function ProfileView() {
  const profile = useQuery(profileQuery());

  if (profile.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.title} />
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void profile.refetch()}
          correlationId={isApiError(profile.error) ? (profile.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (profile.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <PageHeader title={COPY.title} />
        <Skeleton className="h-32 max-w-2xl" />
        <Skeleton className="h-96 max-w-2xl" />
      </div>
    );
  }
  return (
    <div className="space-y-8">
      <PageHeader title={COPY.title} />
      <StatusSection profile={profile.data} />
      <ProfileForm profile={profile.data} />
    </div>
  );
}

function StatusSection({ profile }: { readonly profile: SellerProfile }) {
  return (
    <section aria-labelledby="status-heading" className="max-w-2xl space-y-2">
      <h2 id="status-heading" className="text-lg font-semibold">
        {COPY.statusHeading}
      </h2>
      <StatusBadge value={profile.status} labels={SELLER_STATUS_LABELS} tones={SELLER_STATUS_TONES} />
      {profile.approvedAt === null ? null : (
        <p className="text-sm">{COPY.approvedOn(formatDate(profile.approvedAt))}</p>
      )}
      {profile.status === 'rejected' && profile.rejectionReason !== null ? (
        <p className="text-sm">
          <span className="font-medium">{COPY.rejectionReason}:</span> {profile.rejectionReason}
        </p>
      ) : null}
      <p className="text-sm">{COPY.commission(formatRatePercent(profile.commissionRate))}</p>
      <p className="text-sm text-muted-foreground">{COPY.commissionNote}</p>
    </section>
  );
}

/** SE-07-A1: allowed in any status; only changed fields are sent, the pickup address always whole. */
function ProfileForm({ profile }: { readonly profile: SellerProfile }) {
  const queryClient = useQueryClient();
  const failure = useSubmitFailure();
  const hydrated = useHydrated();
  const governorates = useQuery(governoratesQuery(browserApi));
  const form = useForm<ProfileValues, unknown, z.output<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    mode: 'onBlur',
    defaultValues: profileValues(profile),
  });
  const changed = hasChanges(useWatch({ control: form.control }) as ProfileValues, profile);
  const governorateOptions = (governorates.data ?? []).map((g) => ({ value: g.id, label: g.name }));

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    const patch = profilePatch(values, profile);
    if (patch === null) return;
    try {
      const updated = await updateProfile(patch);
      // The header and banner read the same query (design 02 §3.3: set `profile`).
      queryClient.setQueryData(profileKeys.profile(), updated);
      form.reset(profileValues(updated));
      toast({ title: COPY.saved });
    } catch (error) {
      if (isApiError(error, 'BUSINESS_NAME_TAKEN')) {
        form.setError('businessName', { type: 'server', message: COPY.errors.BUSINESS_NAME_TAKEN });
        return;
      }
      if (isApiError(error, 'GOVERNORATE_NOT_FOUND')) {
        void governorates.refetch();
        form.setError('governorateId', { type: 'server', message: COPY.errors.GOVERNORATE_NOT_FOUND });
        return;
      }
      if (!applyServerErrors(error, form.setError, FIELD_MAP)) failure.fail(error);
    }
  });

  return (
    <section aria-labelledby="details-heading" className="max-w-2xl space-y-4">
      <h2 id="details-heading" className="text-lg font-semibold">
        {COPY.detailsHeading}
      </h2>
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-4">
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        <dl className="space-y-1 text-sm">
          <dt className="font-medium">{COPY.email}</dt>
          <dd>{profile.email}</dd>
          <dd className="text-muted-foreground">{COPY.emailFixed}</dd>
        </dl>
        <Field
          control={form.control}
          name="businessName"
          label={COPY.businessName}
          required
          render={({ field, controlProps }) => (
            <Input {...field} {...controlProps} autoComplete="organization" />
          )}
        />
        <Field
          control={form.control}
          name="contactPhone"
          label={COPY.contactPhone}
          required
          render={({ field, controlProps }) => <PhoneInput {...field} {...controlProps} />}
        />
        <fieldset className="space-y-4">
          <legend className="text-base font-semibold">{COPY.pickupAddress}</legend>
          <p className="text-sm text-muted-foreground">{COPY.pickupHelp}</p>
          {governorates.isError ? (
            <FormAlert>
              {COPY.governoratesFailed}{' '}
              <Button variant="link" className="h-auto px-0" onClick={() => void governorates.refetch()}>
                {UI_COPY.tryAgain}
              </Button>
            </FormAlert>
          ) : null}
          <Field
            control={form.control}
            name="governorateId"
            label={COPY.governorate}
            required
            render={({ field, controlProps }) => (
              <Select
                {...controlProps}
                options={governorateOptions}
                placeholder={COPY.governoratePlaceholder}
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
        <p className="text-sm text-muted-foreground">{COPY.newOrdersOnly}</p>
        <Button
          type="submit"
          loading={form.formState.isSubmitting}
          disabled={!hydrated || !changed || failure.blocked}
        >
          {COPY.save}
        </Button>
      </form>
    </section>
  );
}
