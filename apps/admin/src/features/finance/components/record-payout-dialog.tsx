'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import {
  cairoLocalFromMs,
  cairoLocalToIso,
  fields,
  formatDateTime,
  formatMoney,
  moneyGreaterThan,
} from '@nile/domain';
import { applyServerErrors, useIdempotentMutation } from '@nile/query';
import { Field, Input, Label, Notice, Select, toast } from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useAgentNames, useSellerNames } from '@/features/lookups';
import { createPayout, financeKeys, ownerAccountQuery, type CreatePayoutBody } from '../api';
import { FINANCE_COPY as COPY } from '../copy';
import { PAYEE_TYPES, type PayeeType } from '../lib/params';
import { PayeePicker, type Payee } from './payee-picker';
import { StepDialog, type Step } from './step-dialog';

/** The balance a payout is checked against, per payee type [SPEC 12 FI-6]. */
const OWED_ACCOUNT = { seller: 'seller_payable', agent: 'agent_fee_payable' } as const;
const ZERO = '0.00';

/** `CreatePayoutDto` [VERIFIED]: amount > 0, reference 1..200, `paidAt` with an offset, not in the future. */
const paidAt = z.string().transform((local, context) => {
  const iso = cairoLocalToIso(local);
  if (iso === null) {
    context.addIssue({ code: 'custom', message: COPY.paidAtInvalid });
    return z.NEVER;
  }
  if (Date.parse(iso) > Date.now()) {
    context.addIssue({ code: 'custom', message: COPY.paidAtFuture });
    return z.NEVER;
  }
  return iso;
});

const schema = z.object({
  payeeType: z.enum(PAYEE_TYPES),
  payeeId: z.string().min(1, COPY.payeeRequired),
  amount: fields.positiveMoney,
  externalReference: fields.trimmedString(1, 200),
  paidAt,
});
type Values = z.input<typeof schema>;

const FIELD_MAP = {
  payeeId: { field: 'payeeId', message: COPY.payeeRequired },
  amount: { field: 'amount', message: fields.FIELD_MESSAGES.positiveMoney },
  externalReference: { field: 'externalReference', message: fields.FIELD_MESSAGES.tooLong(200) },
  paidAt: { field: 'paidAt', message: COPY.paidAtInvalid },
} as const;

const isMoney = (value: string) => fields.positiveMoney.safeParse(value).success;

export interface RecordPayoutDialogProps {
  /** AD-21 prefilled from `?payeeType=&payeeId=` (AD-11, AD-18). */
  readonly initialPayee: { readonly payeeType: PayeeType; readonly payeeId: string | null } | null;
  readonly onClose: () => void;
}

/**
 * AD-21 "Record payout": payee type and payee (search), what Nile owes them, amount (warned above it; the
 * backend enforces it), external reference, paid at (Cairo time, default now, never in the future); a summary
 * to confirm; one `Idempotency-Key` per intent, reused on retry.
 */
export function RecordPayoutDialog({ initialPayee, onClose }: RecordPayoutDialogProps) {
  const queryClient = useQueryClient();
  const failure = useSubmitFailure();
  const typeId = useId();
  const [notice, setNotice] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [body, setBody] = useState<CreatePayoutBody | null>(null);
  const [chosen, setChosen] = useState<Payee | null>(null);
  // "Now" as the dialog opened: the default and the latest allowed paid-at (the schema re-checks on submit).
  const [openedAt] = useState(() => cairoLocalFromMs(Date.now()));
  const mutation = useIdempotentMutation({ mutationFn: createPayout });
  const form = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      payeeType: initialPayee?.payeeType ?? 'seller',
      payeeId: initialPayee?.payeeId ?? '',
      amount: '',
      externalReference: '',
      paidAt: openedAt,
    },
  });
  const payeeType = useWatch({ control: form.control, name: 'payeeType' });
  const payeeId = useWatch({ control: form.control, name: 'payeeId' });
  const amount = useWatch({ control: form.control, name: 'amount' });
  const sellerName = useSellerNames([payeeType === 'seller' && payeeId !== '' ? payeeId : null]);
  const agentName = useAgentNames([payeeType === 'agent' && payeeId !== '' ? payeeId : null]);
  const nameOf = (type: PayeeType, id: string) =>
    (chosen?.id === id ? chosen.name : null) ??
    (type === 'seller' ? sellerName(id) : agentName(id)) ??
    COPY.shortId(id);
  const payee: Payee | null = payeeId === '' ? null : { id: payeeId, name: nameOf(payeeType, payeeId) };
  const owedAccount = useQuery({
    ...ownerAccountQuery(payeeId, OWED_ACCOUNT[payeeType]),
    enabled: payeeId !== '',
  });
  const owed = owedAccount.data === undefined ? null : (owedAccount.data?.balance ?? ZERO);
  const { errors } = form.formState;

  const onContinue = form.handleSubmit((values) => {
    failure.clear();
    setNotice(null);
    setBody({
      payeeType: values.payeeType,
      payeeId: values.payeeId,
      amount: values.amount,
      externalReference: values.externalReference,
      paidAt: values.paidAt,
    });
    setStep('confirm');
  });

  const backToForm = () => {
    setStep('form');
  };

  const onConfirm = async () => {
    if (body === null) return;
    failure.clear();
    try {
      const payout = await mutation.mutateAsync(body);
      void queryClient.invalidateQueries({ queryKey: financeKeys.all() });
      toast({
        title: COPY.payoutRecorded(formatMoney(payout.amount), nameOf(payout.payeeType, payout.payeeId)),
        tone: 'success',
      });
      onClose();
    } catch (error) {
      if (isApiError(error, 'PAYOUT_EXCEEDS_BALANCE')) {
        // The message carries the balance as text only: read it again instead (errors by code).
        const fresh = await owedAccount.refetch();
        setNotice(COPY.payeeOwedOnly(formatMoney(fresh.data?.balance ?? ZERO)));
        backToForm();
        return;
      }
      if (isApiError(error, 'PAYEE_NOT_FOUND')) {
        setChosen(null);
        form.setValue('payeeId', '');
        form.setError('payeeId', { type: 'server', message: COPY.payeeGone });
        backToForm();
        return;
      }
      if (isApiError(error, 'PAID_AT_IN_FUTURE')) {
        form.setError('paidAt', { type: 'server', message: COPY.paidAtFuture });
        backToForm();
        return;
      }
      if (isApiError(error, 'PAYOUT_ALREADY_RECORDED')) {
        form.setError('externalReference', { type: 'server', message: COPY.payoutDuplicate });
        backToForm();
        return;
      }
      if (applyServerErrors(error, form.setError, FIELD_MAP)) {
        backToForm();
        return;
      }
      failure.fail(error);
    }
  };

  return (
    <StepDialog
      title={COPY.payoutTitle}
      confirmTitle={COPY.payoutConfirmTitle}
      step={step}
      summary={
        body === null
          ? ''
          : COPY.payoutConfirm(
              formatMoney(body.amount),
              COPY.payeeName(COPY.payeeTypeLabels[body.payeeType], nameOf(body.payeeType, body.payeeId)),
              body.externalReference,
              formatDateTime(body.paidAt),
            )
      }
      confirmLabel={COPY.payoutTitle}
      pending={mutation.isPending}
      failure={{ message: failure.message ?? notice, correlationId: failure.correlationId }}
      onContinue={() => void onContinue()}
      onBack={() => {
        failure.clear();
        backToForm();
      }}
      onConfirm={() => void onConfirm()}
      onClose={onClose}
    >
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onContinue();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor={typeId}>{COPY.payeeType}</Label>
          <Select
            id={typeId}
            options={PAYEE_TYPES.map((type) => ({ value: type, label: COPY.payeeTypeLabels[type] }))}
            value={payeeType}
            onValueChange={(value) => {
              form.setValue('payeeType', value as PayeeType);
              form.setValue('payeeId', '');
              setChosen(null);
            }}
          />
        </div>
        <PayeePicker
          payeeType={payeeType}
          payee={payee}
          owed={owed}
          owedLoading={owedAccount.isPending}
          error={errors.payeeId?.message}
          onChange={(next) => {
            setChosen(next);
            form.setValue('payeeId', next?.id ?? '', { shouldValidate: next !== null });
          }}
        />
        <Field
          control={form.control}
          name="amount"
          label={COPY.amount}
          required
          render={({ field, controlProps }) => <Input {...field} {...controlProps} inputMode="decimal" />}
        />
        {owed !== null && isMoney(amount) && moneyGreaterThan(amount.trim(), owed) ? (
          <Notice>{COPY.aboveOwed}</Notice>
        ) : null}
        <Field
          control={form.control}
          name="externalReference"
          label={COPY.externalReference}
          required
          render={({ field, controlProps }) => <Input {...field} {...controlProps} autoComplete="off" />}
        />
        <Field
          control={form.control}
          name="paidAt"
          label={COPY.paidAt}
          required
          render={({ field, controlProps }) => (
            <Input {...field} {...controlProps} type="datetime-local" max={openedAt} />
          )}
        />
      </form>
    </StepDialog>
  );
}
