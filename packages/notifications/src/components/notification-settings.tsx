'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError } from '@nile/api';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  type NotificationCategory,
} from '@nile/domain';
import { errorMessage } from '@nile/query';
import {
  Button,
  ErrorState,
  Field,
  FormAlert,
  LoadingRegion,
  PageHeader,
  Skeleton,
  Switch,
  toast,
} from '@nile/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { notificationKeys, preferencesQuery, savePreferences, type NotificationPreference } from '../api';
import { useNotificationsConfig } from '../config';
import { SETTINGS_COPY } from '../copy';
import { PushDeviceSection } from './push-device-section';

const preferencesSchema = z.object({
  orders: z.boolean(),
  shipments: z.boolean(),
  support: z.boolean(),
  promotions: z.boolean(),
}) satisfies z.ZodType<Record<NotificationCategory, boolean>>;

type PreferenceValues = z.infer<typeof preferencesSchema>;

function toValues(preferences: readonly NotificationPreference[]): PreferenceValues {
  const enabled = (category: NotificationCategory) =>
    preferences.find((preference) => preference.category === category)?.pushEnabled ?? false;
  return {
    orders: enabled('orders'),
    shipments: enabled('shipments'),
    support: enabled('support'),
    promotions: enabled('promotions'),
  };
}

function PreferencesForm({ preferences }: { readonly preferences: readonly NotificationPreference[] }) {
  const { api, scope } = useNotificationsConfig();
  const queryClient = useQueryClient();
  const saved = toValues(preferences);
  const form = useForm<PreferenceValues>({ resolver: zodResolver(preferencesSchema), defaultValues: saved });

  const save = useMutation({
    mutationFn: (changed: NotificationPreference[]) => savePreferences(api, changed),
    onSuccess: (answer) => {
      // The API answers all four categories: the cache and the form take them as saved.
      queryClient.setQueryData(notificationKeys(scope).preferences(), answer);
      form.reset(toValues(answer));
      toast({ title: SETTINGS_COPY.saved, tone: 'success' });
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    const changed = NOTIFICATION_CATEGORIES.filter((category) => values[category] !== saved[category]).map(
      (category) => ({ category, pushEnabled: values[category] }),
    );
    // Save is disabled without a change; the API refuses an empty list (spec 13 NO-18).
    if (changed.length > 0) save.mutate(changed);
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4" noValidate>
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">{SETTINGS_COPY.pushHeading}</legend>
        <p className="text-sm text-muted-foreground">{SETTINGS_COPY.pushDescription}</p>
        {NOTIFICATION_CATEGORIES.map((category) => (
          <Field
            key={category}
            control={form.control}
            name={category}
            label={NOTIFICATION_CATEGORY_LABELS[category]}
            layout="inline"
            render={({ field, controlProps }) => (
              <Switch
                {...controlProps}
                checked={field.value}
                onCheckedChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        ))}
        <p className="text-sm text-muted-foreground">{SETTINGS_COPY.inAppNote}</p>
      </fieldset>
      {save.isError ? (
        <FormAlert
          correlationId={save.error instanceof ApiError ? (save.error.correlationId ?? undefined) : undefined}
        >
          {errorMessage(save.error)}
        </FormAlert>
      ) : null}
      <Button type="submit" disabled={!form.formState.isDirty} loading={save.isPending}>
        {SETTINGS_COPY.save}
      </Button>
    </form>
  );
}

/** SF-33 / SE-28 / AD-41 / AG-10 (spec 00 §12.6): this device's push, then one switch per category. */
export function NotificationSettings() {
  const { api, scope } = useNotificationsConfig();
  const preferences = useQuery(preferencesQuery(api, scope));

  let form;
  if (preferences.isPending) {
    form = (
      <LoadingRegion className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6" />
        <Skeleton className="h-6" />
        <Skeleton className="h-6" />
      </LoadingRegion>
    );
  } else if (preferences.isError) {
    form = <ErrorState onRetry={() => void preferences.refetch()} retrying={preferences.isFetching} />;
  } else {
    form = <PreferencesForm preferences={preferences.data} />;
  }

  return (
    <div className="max-w-xl space-y-8">
      <PageHeader title={SETTINGS_COPY.title} />
      <PushDeviceSection />
      {form}
    </div>
  );
}
