'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
import { fields, formatMoney } from '@nile/domain';
import { errorMessage } from '@nile/query';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  Input,
  toast,
  type DataTableColumn,
} from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormDialog } from '@/components/form-dialog';
import { adminGovernoratesQuery, lookupKeys } from '@/features/lookups';
import { setDeliveryFee, type Governorate } from '../api';
import { DELIVERY_COPY as COPY } from '../copy';

interface Action {
  readonly kind: 'fee' | 'stop';
  readonly governorate: Governorate;
}

/** The answer replaces the row in the shared governorates list (names elsewhere read the same query). */
function useGovernorateUpdates() {
  const queryClient = useQueryClient();
  const settle = (updated: Governorate) => {
    queryClient.setQueryData<Governorate[]>(lookupKeys.governorates(), (current) =>
      current?.map((governorate) => (governorate.id === updated.id ? updated : governorate)),
    );
  };
  /** `GOVERNORATE_NOT_FOUND` → refetch (spec 03 AD-08). True when handled. */
  const handleGone = (error: unknown): boolean => {
    if (!isApiError(error, 'GOVERNORATE_NOT_FOUND')) return false;
    void queryClient.invalidateQueries({ queryKey: lookupKeys.governorates() });
    toast({ title: COPY.gone, tone: 'destructive' });
    return true;
  };
  return { settle, handleGone };
}

/** AD-08 item 2: the 27 governorates by name, each with "Set fee" and, when deliverable, "Stop delivering". */
export function GovernoratesTable() {
  // Fees are edited here: always read them fresh on this page (the lookup elsewhere is cached).
  const governorates = useQuery({ ...adminGovernoratesQuery(), staleTime: 0 });
  const [action, setAction] = useState<Action | null>(null);
  const { settle, handleGone } = useGovernorateUpdates();
  const close = () => {
    setAction(null);
  };

  const columns: readonly DataTableColumn<Governorate>[] = [
    { id: 'name', header: COPY.columns.name, cell: (row) => row.name },
    { id: 'code', header: COPY.columns.code, cell: (row) => row.code },
    {
      id: 'fee',
      header: COPY.columns.fee,
      align: 'end',
      cell: (row) => (row.deliveryFee === null ? COPY.noFee : formatMoney(row.deliveryFee)),
    },
    {
      id: 'deliverable',
      header: COPY.columns.deliverable,
      cell: (row) => (
        <Badge tone={row.isDeliverable ? 'success' : 'neutral'}>
          {row.isDeliverable ? COPY.deliverable : COPY.notDeliverable}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: COPY.columns.actions,
      cell: (row) => (
        <span className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            aria-label={COPY.setFeeFor(row.name)}
            onClick={() => {
              setAction({ kind: 'fee', governorate: row });
            }}
          >
            {COPY.setFee}
          </Button>
          {row.isDeliverable ? (
            <Button
              size="sm"
              variant="ghost"
              aria-label={COPY.stopFor(row.name)}
              onClick={() => {
                setAction({ kind: 'stop', governorate: row });
              }}
            >
              {COPY.stop}
            </Button>
          ) : null}
        </span>
      ),
    },
  ];

  const stop = async (governorate: Governorate) => {
    try {
      settle(await setDeliveryFee(governorate.id, null));
      toast({ title: COPY.stopped(governorate.name) });
    } catch (error) {
      if (handleGone(error)) return;
      toast({ title: errorMessage(error), tone: 'destructive' });
      throw error;
    }
  };

  return (
    <section aria-labelledby="governorates-heading" className="space-y-3">
      <h2 id="governorates-heading" className="text-lg font-semibold">
        {COPY.governoratesHeading}
      </h2>
      <p className="text-sm text-muted-foreground">{COPY.governoratesNote}</p>
      {governorates.isError ? (
        <ErrorState
          message={COPY.governoratesFailed}
          onRetry={() => void governorates.refetch()}
          correlationId={
            isApiError(governorates.error) ? (governorates.error.correlationId ?? undefined) : undefined
          }
        />
      ) : (
        <DataTable
          caption={COPY.governoratesCaption}
          columns={columns}
          rows={[...(governorates.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'en'))}
          getRowId={(row) => row.id}
          loading={governorates.isPending}
          empty={null}
          hasMore={false}
          loadingMore={false}
          onLoadMore={() => undefined}
        />
      )}
      {action?.kind === 'fee' ? (
        <FeeDialog
          governorate={action.governorate}
          onClose={close}
          onSaved={settle}
          handleGone={handleGone}
        />
      ) : null}
      <ConfirmDialog
        open={action?.kind === 'stop'}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={action === null ? COPY.stop : COPY.stopFor(action.governorate.name)}
        description={action === null ? '' : COPY.stopConfirm(action.governorate.name)}
        confirmLabel={COPY.stop}
        destructive
        onConfirm={() => (action === null ? undefined : stop(action.governorate))}
      />
    </section>
  );
}

const feeSchema = z.object({ deliveryFee: fields.money });

interface FeeDialogProps {
  readonly governorate: Governorate;
  readonly onClose: () => void;
  readonly onSaved: (updated: Governorate) => void;
  readonly handleGone: (error: unknown) => boolean;
}

/** "Set fee": money ≥ 0, prefilled with the current fee. */
function FeeDialog({ governorate, onClose, onSaved, handleGone }: FeeDialogProps) {
  const form = useForm<{ deliveryFee: string }, unknown, z.output<typeof feeSchema>>({
    resolver: zodResolver(feeSchema),
    mode: 'onBlur',
    defaultValues: { deliveryFee: governorate.deliveryFee ?? '' },
  });
  return (
    <FormDialog
      title={COPY.feeTitle(governorate.name)}
      description={COPY.governoratesNote}
      confirmLabel={COPY.feeSave}
      form={form}
      onClose={onClose}
      handleError={handleGone}
      onSubmit={async ({ deliveryFee }) => {
        const updated = await setDeliveryFee(governorate.id, deliveryFee);
        onSaved(updated);
        toast({
          title: COPY.feeSaved(updated.name, formatMoney(updated.deliveryFee ?? deliveryFee)),
          tone: 'success',
        });
        return true;
      }}
    >
      <Field
        control={form.control}
        name="deliveryFee"
        label={COPY.fee}
        required
        render={({ field, controlProps }) => <Input {...field} {...controlProps} inputMode="decimal" />}
      />
    </FormDialog>
  );
}
