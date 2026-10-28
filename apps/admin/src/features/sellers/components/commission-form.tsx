'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { formatRatePercent, ratePercentValue, percentRate } from '@nile/domain';
import { Button, Field, FormAlert, Input, toast } from '@nile/ui';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { setCommissionRate, type AdminSellerDetail } from '../api';
import { SELLERS_COPY as COPY } from '../copy';
import { useSellerUpdates } from './seller-actions';

const schema = z.object({ commissionRate: percentRate });

/** AD-05 "Change commission", any status: entered as a percent, sent as the API's fraction (12.5 → "0.1250"). */
export function CommissionForm({ seller }: { readonly seller: AdminSellerDetail }) {
  const failure = useSubmitFailure();
  const { settle } = useSellerUpdates(seller.id);
  const form = useForm<{ commissionRate: string }, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { commissionRate: ratePercentValue(seller.commissionRate) },
  });

  const onSubmit = form.handleSubmit(async ({ commissionRate }) => {
    failure.clear();
    try {
      const updated = await setCommissionRate(seller.id, commissionRate);
      settle(updated);
      form.reset({ commissionRate: ratePercentValue(updated.commissionRate) });
      toast({ title: COPY.commissionSaved(formatRatePercent(updated.commissionRate)), tone: 'success' });
    } catch (error) {
      if (isApiError(error, 'COMMISSION_RATE_UNCHANGED')) {
        form.setError('commissionRate', { type: 'server', message: COPY.commissionUnchanged });
        return;
      }
      failure.fail(error);
    }
  });

  return (
    <section aria-labelledby="commission-heading" className="max-w-md space-y-3">
      <h2 id="commission-heading" className="text-lg font-semibold">
        {COPY.commissionHeading}
      </h2>
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-3">
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        <Field
          control={form.control}
          name="commissionRate"
          label={COPY.commissionRate}
          description={COPY.commissionHelp}
          required
          render={({ field, controlProps }) => <Input {...field} {...controlProps} inputMode="decimal" />}
        />
        <Button type="submit" loading={form.formState.isSubmitting} disabled={failure.blocked}>
          {COPY.commissionSave}
        </Button>
      </form>
    </section>
  );
}
