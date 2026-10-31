'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
import { fields, TICKET_CATEGORY_LABELS, type TicketCategory } from '@nile/domain';
import { applyServerErrors, errorMessage, useIdempotentMutation } from '@nile/query';
import {
  Button,
  buttonVariants,
  Field,
  FormAlert,
  Input,
  LoadingRegion,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
  UI_COPY,
} from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { openTicket, SUBJECT_MIN, supportKeys, type OpenTicketBody, type Ticket } from '../api';
import { useSupportConfig, type OrderChoice } from '../config';
import { NEW_TICKET_COPY as COPY } from '../copy';
import {
  NO_ORDER,
  newTicketSchema,
  openTicketBody,
  type NewTicketOutput,
  type NewTicketValues,
  type TicketLink,
} from '../schemas';
import { markNotAttachable, PhotoPicker, useSupportUploads } from './photo-picker';

export interface NewTicketFormProps {
  /** From the URL (SF-30 `?category=&order=&sellerOrder=`); values this role can't use are dropped. */
  readonly initial: {
    readonly category: string | null;
    readonly orderId: string | null;
    readonly sellerOrderId: string | null;
    /** A starting subject the app built (e.g. the seller's blocked product, spec 02 SE-Q-14). */
    readonly subject?: string | null;
  };
}

/** SF-30 / SE-25 New ticket. With an order select the choices load first, so the URL's order can be shown. */
export function NewTicketForm({ initial }: NewTicketFormProps) {
  const { orderChoices, scope, linkKind = 'order' } = useSupportConfig();
  const selectedId = linkKind === 'sellerOrder' ? initial.sellerOrderId : initial.orderId;
  const choices = useQuery({
    queryKey: supportKeys(scope).orderChoices(selectedId),
    queryFn: ({ signal }) => orderChoices?.(selectedId, signal) ?? Promise.resolve([]),
    enabled: orderChoices !== undefined,
    staleTime: 0,
  });
  if (orderChoices !== undefined && choices.isPending) {
    return (
      <div className="max-w-2xl space-y-6">
        <PageHeader title={COPY.title} />
        <LoadingRegion className="space-y-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-32" />
        </LoadingRegion>
      </div>
    );
  }
  return (
    <TicketForm
      initial={initial}
      choices={orderChoices === undefined ? null : (choices.data ?? [])}
      choicesFailed={choices.isError}
    />
  );
}

interface TicketFormProps extends NewTicketFormProps {
  /** null: no order select (sellers link a parcel only through the URL). */
  readonly choices: readonly OrderChoice[] | null;
  readonly choicesFailed: boolean;
}

function TicketForm({ initial, choices, choicesFailed }: TicketFormProps) {
  const { api, scope, categories, routes, navigate, Link, linkKind = 'order' } = useSupportConfig();
  const queryClient = useQueryClient();
  const { uploads, cooldownSeconds } = useSupportUploads();
  const [alert, setAlert] = useState<{ message: string; correlationId?: string } | null>(null);

  const initialCategory = categories.find((category) => category === initial.category) ?? null;
  const initialOrder =
    choices?.find(
      (choice) => choice.id === (linkKind === 'sellerOrder' ? initial.sellerOrderId : initial.orderId),
    ) ?? null;
  // A parcel from the URL stays linked only with its own order (backend spec 16 §4.1); a seller-order select
  // carries the parcel itself.
  const link: TicketLink =
    choices === null
      ? { orderId: null, sellerOrderId: initial.sellerOrderId }
      : linkKind === 'sellerOrder'
        ? { orderId: null, sellerOrderId: null }
        : {
            orderId: initialOrder?.id ?? null,
            sellerOrderId: initialOrder === null ? null : initial.sellerOrderId,
          };

  const form = useForm<NewTicketValues, unknown, NewTicketOutput>({
    resolver: zodResolver(newTicketSchema),
    defaultValues: {
      category: initialCategory,
      orderId: initialOrder?.id ?? NO_ORDER,
      subject: initial.subject ?? '',
      body: '',
    },
  });
  const orderId = useWatch({ control: form.control, name: 'orderId' });
  const linkedSeller =
    orderId === link.orderId
      ? initialOrder?.sellers?.find((seller) => seller.sellerOrderId === link.sellerOrderId)
      : undefined;

  const open = useIdempotentMutation<Ticket, OpenTicketBody>({
    mutationFn: (body, key) => openTicket(api, body, key),
    intentScope: ['support', 'ticket'],
    onSuccess: async (ticket) => {
      uploads.clear();
      await queryClient.invalidateQueries({ queryKey: supportKeys(scope).lists() });
      navigate(routes.ticket(ticket.id));
    },
  });

  const fail = (error: unknown) => {
    if (markNotAttachable(uploads, error)) return;
    if (isApiError(error, 'SUPPORT_CATEGORY_NOT_ALLOWED')) {
      form.setError('category', { type: 'server', message: COPY.categoryNotAllowed });
      return;
    }
    if (choices !== null && isApiError(error, 'ORDER_NOT_FOUND', 'SELLER_ORDER_NOT_FOUND')) {
      form.setError('orderId', { type: 'server', message: COPY.chooseOrder });
      return;
    }
    const mapped = applyServerErrors(error, form.setError, {
      category: { field: 'category', message: COPY.chooseCategory },
      subject: { field: 'subject', message: fields.FIELD_MESSAGES.tooShort(SUBJECT_MIN) },
      body: { field: 'body', message: fields.FIELD_MESSAGES.required },
    });
    if (mapped) return;
    setAlert({
      message: errorMessage(error, {
        SUPPORT_OPEN_TICKET_LIMIT_REACHED: COPY.limitReached,
        ORDER_NOT_FOUND: COPY.chooseOrder,
        SELLER_ORDER_NOT_FOUND: COPY.chooseOrder,
      }),
      ...(isApiError(error) && error.correlationId !== null ? { correlationId: error.correlationId } : {}),
    });
  };

  const submit = form.handleSubmit((values) => {
    setAlert(null);
    open.mutate(openTicketBody(values, link, uploads.readyMediaIds, choices === null ? null : linkKind), {
      onError: fail,
    });
  });

  const busy = uploads.busy || open.isPending;
  const categoryOptions = categories.map((category: TicketCategory) => ({
    value: category,
    label: TICKET_CATEGORY_LABELS[category],
  }));
  const orderOptions = [
    { value: NO_ORDER, label: COPY.noOrder },
    ...(choices ?? []).map((choice) => ({ value: choice.id, label: COPY.orderOption(choice.orderNumber) })),
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title={COPY.title} />
      <form noValidate onSubmit={(event) => void submit(event)} className="space-y-5">
        {alert === null ? null : <FormAlert correlationId={alert.correlationId}>{alert.message}</FormAlert>}
        <Field
          control={form.control}
          name="category"
          label={COPY.category}
          required
          render={({ field, controlProps }) => (
            <Select
              {...controlProps}
              options={categoryOptions}
              placeholder={COPY.categoryPlaceholder}
              value={field.value ?? ''}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
        {choices === null ? null : (
          <div className="space-y-2">
            <Field
              control={form.control}
              name="orderId"
              label={COPY.order}
              render={({ field, controlProps }) => (
                <Select
                  {...controlProps}
                  options={orderOptions}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
            {linkedSeller === undefined ? null : (
              <p className="text-sm text-muted-foreground">{COPY.sellerLine(linkedSeller.businessName)}</p>
            )}
            {choicesFailed ? <p className="text-sm text-muted-foreground">{COPY.ordersLoadFailed}</p> : null}
          </div>
        )}
        <Field
          control={form.control}
          name="subject"
          label={COPY.subject}
          required
          render={({ field, controlProps }) => <Input {...field} {...controlProps} />}
        />
        <Field
          control={form.control}
          name="body"
          label={COPY.message}
          required
          render={({ field, controlProps }) => <Textarea {...field} {...controlProps} rows={6} />}
        />
        <PhotoPicker label={COPY.photos} uploads={uploads} cooldownSeconds={cooldownSeconds} />
        {uploads.busy ? <p className="text-sm text-muted-foreground">{UI_COPY.waitForUploads}</p> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            {COPY.submit}
          </Button>
          <Link href={routes.list('open')} className={buttonVariants({ variant: 'outline' })}>
            {COPY.cancel}
          </Link>
        </div>
      </form>
    </div>
  );
}
