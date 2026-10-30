import { fields, type TicketCategory } from '@nile/domain';
import * as z from 'zod';
import { MESSAGE_MAX, SUBJECT_MAX, SUBJECT_MIN, type OpenTicketBody, type PostMessageBody } from './api';
import { NEW_TICKET_COPY } from './copy';

// SF-30 and the thread composer (backend spec 16 §4.1: subject 3..150, body 1..4000, both trimmed).

/** The order select's "none" value (a select can't hold an empty value). */
export const NO_ORDER = 'none';

export const newTicketSchema = z
  .object({
    category: z.custom<TicketCategory | null>(),
    orderId: z.string(),
    subject: fields.trimmedString(SUBJECT_MIN, SUBJECT_MAX),
    body: fields.trimmedString(1, MESSAGE_MAX),
  })
  .superRefine((values, ctx) => {
    if (values.category === null)
      ctx.addIssue({ code: 'custom', path: ['category'], message: NEW_TICKET_COPY.chooseCategory });
  });

export type NewTicketValues = z.input<typeof newTicketSchema>;
export type NewTicketOutput = z.output<typeof newTicketSchema>;

/** What the URL linked (SF-30 `?order=&sellerOrder=`); a parcel only goes with its own order. */
export interface TicketLink {
  readonly orderId: string | null;
  readonly sellerOrderId: string | null;
}

/**
 * `POST /support/tickets`. With an order select (customers) the chosen order is sent, and the URL's parcel only
 * while that order is still chosen; without one (sellers) only the URL's parcel (backend spec 16 §4.1).
 */
export function openTicketBody(
  values: NewTicketOutput,
  link: TicketLink,
  attachmentMediaIds: readonly string[],
  hasOrderSelect: boolean,
): OpenTicketBody {
  if (values.category === null) throw new Error('newTicketSchema lets no ticket through without a category');
  const orderId = hasOrderSelect && values.orderId !== NO_ORDER ? values.orderId : null;
  const sellerOrderId = hasOrderSelect
    ? orderId !== null && orderId === link.orderId
      ? link.sellerOrderId
      : null
    : link.sellerOrderId;
  return {
    category: values.category,
    subject: values.subject,
    body: values.body,
    ...(orderId === null ? {} : { orderId }),
    ...(sellerOrderId === null ? {} : { sellerOrderId }),
    ...(attachmentMediaIds.length === 0 ? {} : { attachmentMediaIds: [...attachmentMediaIds] }),
  };
}

export const messageSchema = z.object({ body: fields.trimmedString(1, MESSAGE_MAX) });

export type MessageValues = z.input<typeof messageSchema>;

export function postMessageBody(body: string, attachmentMediaIds: readonly string[]): PostMessageBody {
  return {
    body,
    ...(attachmentMediaIds.length === 0 ? {} : { attachmentMediaIds: [...attachmentMediaIds] }),
  };
}
