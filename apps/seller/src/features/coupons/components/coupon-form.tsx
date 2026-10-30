'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ApiError, isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useHydrated, useSubmitFailure } from '@nile/auth-screens';
import { COUPON_SCOPE_LABELS, DISCOUNT_TYPE_LABELS, fields } from '@nile/domain';
import { applyServerErrors, categoriesTreeQuery } from '@nile/query';
import { Button, Field, FormAlert, Input, Select, Switch, toast } from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { useForm, useWatch, type UseFormSetError } from 'react-hook-form';
import { categoryChoices } from '@/features/products';
import { useNotApprovedHandler, useSellerAccess } from '@/features/profile';
import { browserApi } from '@/lib/browser-api';
import { couponPath } from '@/lib/routes';
import { couponKeys, createCoupon, updateCoupon, type Coupon } from '../api';
import { COUPONS_COPY as COPY } from '../copy';
import {
  couponFormValues,
  couponPatch,
  couponSchema,
  emptyCouponValues,
  GLOBAL_LIMIT_MAX,
  isLocked,
  PER_CUSTOMER_MAX,
  toCreateBody,
  type CouponFormValues,
  type CouponOutput,
} from '../lib/form';

const INVALID = COPY.invalid;
type FieldName = keyof CouponFormValues;

/** API field → form field and its sentence, for `VALIDATION_FAILED` and `COUPON_INVALID` details. */
const FIELD_MAP = {
  code: { field: 'code', message: INVALID.code },
  discountType: { field: 'discountType', message: INVALID.field },
  discountValue: { field: 'discountValue', message: INVALID.field },
  maxDiscount: { field: 'maxDiscount', message: fields.FIELD_MESSAGES.positiveMoney },
  minItemsSubtotal: { field: 'minItemsSubtotal', message: fields.FIELD_MESSAGES.money },
  scope: { field: 'scope', message: INVALID.field },
  scopeCategoryId: { field: 'scopeCategoryId', message: INVALID.category },
  startsAt: { field: 'startsAt', message: INVALID.field },
  endsAt: { field: 'endsAt', message: INVALID.field },
  globalLimit: { field: 'globalLimit', message: INVALID.globalLimit },
  perCustomerLimit: { field: 'perCustomerLimit', message: INVALID.perCustomerLimit },
  status: { field: 'active', message: INVALID.field },
} as const satisfies Readonly<Record<string, { field: FieldName; message: string }>>;

/** `COUPON_INVALID` names the fields in `details` (spec 02 SE-22); true when every one was placed. */
function placeCouponInvalid(error: ApiError, setError: UseFormSetError<CouponFormValues>): boolean {
  let all = error.details.length > 0;
  for (const detail of error.details) {
    const target = Object.hasOwn(FIELD_MAP, detail.field)
      ? FIELD_MAP[detail.field as keyof typeof FIELD_MAP]
      : undefined;
    if (target === undefined) all = false;
    else setError(target.field, { type: 'server', message: target.message });
  }
  return all;
}

export type CouponFormProps =
  | { readonly mode: 'create'; readonly coupon?: undefined }
  | { readonly mode: 'edit'; readonly coupon: Coupon };

/**
 * SE-22 / SE-23 form. Create sends the documented fields; edit sends only what changed and, after the first
 * use, only the end, total uses and Active (the rest is read-only, PR-8). Active can't be turned on while Nile
 * blocks the coupon.
 */
export function CouponForm({ mode, coupon }: CouponFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const failure = useSubmitFailure();
  const access = useSellerAccess();
  const handleNotApproved = useNotApprovedHandler();
  const locked = coupon !== undefined && isLocked(coupon);
  const schema = useMemo(
    () => couponSchema({ mode, usedCount: coupon?.redemptionCount ?? 0 }),
    [mode, coupon?.redemptionCount],
  );
  const [defaults] = useState(() =>
    coupon === undefined ? emptyCouponValues(Date.now()) : couponFormValues(coupon),
  );
  const form = useForm<CouponFormValues, unknown, CouponOutput>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: defaults,
  });
  const watched = useWatch({ control: form.control }) as CouponFormValues;
  const parsed = schema.safeParse(watched);
  // Edit: Save only with a change (an invalid value counts, so submitting shows its error).
  const changed = coupon === undefined || !parsed.success || couponPatch(parsed.data, coupon) !== null;

  const tree = useQuery(categoriesTreeQuery(browserApi));
  const choices = useMemo(() => categoryChoices(tree.data ?? []), [tree.data]);

  const refetch = () => {
    if (coupon !== undefined) void queryClient.invalidateQueries({ queryKey: couponKeys.detail(coupon.id) });
  };

  const settle = (saved: Coupon) => {
    queryClient.setQueryData(couponKeys.detail(saved.id), saved);
    void queryClient.invalidateQueries({ queryKey: couponKeys.lists() });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    try {
      if (coupon === undefined) {
        const created = await createCoupon(toCreateBody(values));
        settle(created);
        toast({ title: COPY.created, tone: 'success' });
        router.push(couponPath(created.id));
        return;
      }
      const patch = couponPatch(values, coupon);
      if (patch === null) return;
      settle(await updateCoupon(coupon.id, patch));
      toast({ title: COPY.saved, tone: 'success' });
    } catch (error) {
      if (handleNotApproved(error)) return;
      if (isApiError(error, 'COUPON_CODE_TAKEN')) {
        form.setError('code', { type: 'server', message: COPY.errors.COUPON_CODE_TAKEN });
        return;
      }
      if (isApiError(error, 'CATEGORY_NOT_FOUND')) {
        form.setError('scopeCategoryId', { type: 'server', message: COPY.errors.CATEGORY_NOT_FOUND });
        return;
      }
      if (isApiError(error, 'COUPON_LOCKED') || isApiError(error, 'COUPON_BLOCKED')) {
        refetch();
        toast({ title: COPY.errors[error.code], tone: 'destructive' });
        return;
      }
      if (isApiError(error, 'COUPON_NOT_FOUND')) {
        refetch();
        return;
      }
      if (isApiError(error, 'COUPON_INVALID') && placeCouponInvalid(error, form.setError)) return;
      if (!applyServerErrors<FieldName>(error, form.setError, FIELD_MAP)) failure.fail(error);
    }
  });

  const percent = watched.discountType === 'percent';
  const reasonId = useId();
  const activeBlocked = coupon?.adminBlocked === true && coupon.status === 'inactive';

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="max-w-2xl space-y-5">
      {failure.message === null ? null : (
        <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
      )}
      <p className="text-sm text-muted-foreground">{COPY.help}</p>
      {/* PR-8: the fields that stay editable are the end, total uses and Active. */}
      {locked ? <p className="text-sm font-medium">{COPY.locked}</p> : null}
      {mode === 'create' ? (
        <Field
          control={form.control}
          name="code"
          label={COPY.fields.code}
          description={COPY.fields.codeHint}
          required
          render={({ field, controlProps }) => (
            <Input {...field} {...controlProps} autoComplete="off" maxLength={32} className="uppercase" />
          )}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          control={form.control}
          name="discountType"
          label={COPY.fields.discountType}
          required
          render={({ field, controlProps }) => (
            <Select
              {...controlProps}
              disabled={locked}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              options={(['percent', 'fixed'] as const).map((type) => ({
                value: type,
                label: DISCOUNT_TYPE_LABELS[type],
              }))}
            />
          )}
        />
        <Field
          control={form.control}
          name="discountValue"
          label={percent ? COPY.fields.percent : COPY.fields.fixed}
          required
          render={({ field, controlProps }) => (
            <Input {...field} {...controlProps} inputMode="decimal" disabled={locked} />
          )}
        />
        {percent ? (
          <Field
            control={form.control}
            name="maxDiscount"
            label={COPY.fields.maxDiscount}
            render={({ field, controlProps }) => (
              <Input {...field} {...controlProps} inputMode="decimal" disabled={locked} />
            )}
          />
        ) : null}
        <Field
          control={form.control}
          name="minItemsSubtotal"
          label={COPY.fields.minItemsSubtotal}
          description={COPY.fields.minItemsHint}
          required
          render={({ field, controlProps }) => (
            <Input {...field} {...controlProps} inputMode="decimal" disabled={locked} />
          )}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          control={form.control}
          name="scope"
          label={COPY.fields.appliesTo}
          required
          render={({ field, controlProps }) => (
            <Select
              {...controlProps}
              disabled={locked}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              options={(['seller', 'category'] as const).map((scope) => ({
                value: scope,
                label: COUPON_SCOPE_LABELS.seller[scope],
              }))}
            />
          )}
        />
        {watched.scope === 'category' ? (
          <Field
            control={form.control}
            name="scopeCategoryId"
            label={COPY.fields.category}
            required
            render={({ field, controlProps }) => (
              <Select
                {...controlProps}
                disabled={locked || tree.isPending}
                placeholder={COPY.fields.categoryPlaceholder}
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                options={choices.map((choice) => ({ value: choice.id, label: choice.path }))}
              />
            )}
          />
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          control={form.control}
          name="startsAt"
          label={COPY.fields.starts}
          description={COPY.fields.timesHint}
          required
          render={({ field, controlProps }) => (
            <Input {...field} {...controlProps} type="datetime-local" disabled={locked} />
          )}
        />
        <Field
          control={form.control}
          name="endsAt"
          label={COPY.fields.ends}
          description={COPY.fields.timesHint}
          required
          render={({ field, controlProps }) => <Input {...field} {...controlProps} type="datetime-local" />}
        />
        <Field
          control={form.control}
          name="globalLimit"
          label={COPY.fields.globalLimit}
          description={COPY.fields.globalLimitHint}
          render={({ field, controlProps }) => (
            <Input
              {...field}
              {...controlProps}
              type="number"
              inputMode="numeric"
              min={Math.max(1, coupon?.redemptionCount ?? 1)}
              max={GLOBAL_LIMIT_MAX}
            />
          )}
        />
        <Field
          control={form.control}
          name="perCustomerLimit"
          label={COPY.fields.perCustomerLimit}
          required
          render={({ field, controlProps }) => (
            <Input
              {...field}
              {...controlProps}
              type="number"
              inputMode="numeric"
              min={1}
              max={PER_CUSTOMER_MAX}
              disabled={locked}
            />
          )}
        />
      </div>
      {mode === 'edit' ? (
        <Field
          control={form.control}
          name="active"
          label={COPY.fields.active}
          layout="inline"
          {...(activeBlocked ? { description: COPY.fields.blockedActive } : {})}
          render={({ field, controlProps }) => (
            <Switch
              {...controlProps}
              checked={field.value}
              disabled={activeBlocked}
              onCheckedChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          loading={form.formState.isSubmitting}
          disabled={!hydrated || !access.catalog || !changed || failure.blocked}
          aria-describedby={access.catalog || access.reason === null ? undefined : reasonId}
        >
          {mode === 'create' ? COPY.create : COPY.save}
        </Button>
        {access.catalog || access.reason === null ? null : (
          <p id={reasonId} className="text-sm text-muted-foreground">
            {access.reason}
          </p>
        )}
      </div>
    </form>
  );
}
