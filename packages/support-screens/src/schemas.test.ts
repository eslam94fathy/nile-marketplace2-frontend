import { describe, expect, it } from 'vitest';
import { messageSchema, newTicketSchema, NO_ORDER, openTicketBody, postMessageBody } from './schemas';
import { parseSupportTab } from './tabs';

const VALUES = {
  category: 'order' as const,
  orderId: 'o-1',
  subject: '  Late parcel ',
  body: ' Where is it? ',
};

describe('POST /support/tickets body (backend spec 16 §4.1)', () => {
  it('customer: the chosen order, the URL parcel with its own order, trimmed text, photos', () => {
    const parsed = newTicketSchema.parse(VALUES);
    expect(openTicketBody(parsed, { orderId: 'o-1', sellerOrderId: 'so-1' }, ['m1'], 'order')).toEqual({
      category: 'order',
      subject: 'Late parcel',
      body: 'Where is it?',
      orderId: 'o-1',
      sellerOrderId: 'so-1',
      attachmentMediaIds: ['m1'],
    });
  });

  it('customer: another order drops the URL parcel; "No order" sends neither', () => {
    const other = newTicketSchema.parse({ ...VALUES, orderId: 'o-2' });
    expect(openTicketBody(other, { orderId: 'o-1', sellerOrderId: 'so-1' }, [], 'order')).toEqual({
      category: 'order',
      subject: 'Late parcel',
      body: 'Where is it?',
      orderId: 'o-2',
    });
    const none = newTicketSchema.parse({ ...VALUES, orderId: NO_ORDER });
    const body = openTicketBody(none, { orderId: 'o-1', sellerOrderId: 'so-1' }, [], 'order');
    expect(body).not.toHaveProperty('orderId');
    expect(body).not.toHaveProperty('sellerOrderId');
  });

  it('seller-order select: the chosen parcel as sellerOrderId only; none chosen → no link', () => {
    const parsed = newTicketSchema.parse({ ...VALUES, orderId: 'so-3' });
    expect(openTicketBody(parsed, { orderId: null, sellerOrderId: null }, [], 'sellerOrder')).toEqual({
      category: 'order',
      subject: 'Late parcel',
      body: 'Where is it?',
      sellerOrderId: 'so-3',
    });
    const none = newTicketSchema.parse({ ...VALUES, orderId: NO_ORDER });
    const body = openTicketBody(none, { orderId: null, sellerOrderId: null }, [], 'sellerOrder');
    expect(body).not.toHaveProperty('sellerOrderId');
    expect(body).not.toHaveProperty('orderId');
  });

  it('URL parcel only (no order select): never an order id', () => {
    const parsed = newTicketSchema.parse({ ...VALUES, orderId: NO_ORDER });
    expect(openTicketBody(parsed, { orderId: null, sellerOrderId: 'so-9' }, [], null)).toEqual({
      category: 'order',
      subject: 'Late parcel',
      body: 'Where is it?',
      sellerOrderId: 'so-9',
    });
  });

  it('a category is required; subject 3..150 and message 1..4000 after trimming', () => {
    expect(newTicketSchema.safeParse({ ...VALUES, category: null }).success).toBe(false);
    expect(newTicketSchema.safeParse({ ...VALUES, subject: ' ab ' }).success).toBe(false);
    expect(newTicketSchema.safeParse({ ...VALUES, subject: 'x'.repeat(151) }).success).toBe(false);
    expect(newTicketSchema.safeParse({ ...VALUES, body: '   ' }).success).toBe(false);
    expect(newTicketSchema.safeParse({ ...VALUES, body: 'x'.repeat(4001) }).success).toBe(false);
  });
});

describe('POST …/messages body', () => {
  it('trimmed text, photos only when there are some', () => {
    expect(messageSchema.parse({ body: ' Thanks \n' }).body).toBe('Thanks');
    expect(messageSchema.safeParse({ body: ' ' }).success).toBe(false);
    expect(postMessageBody('Hi', [])).toEqual({ body: 'Hi' });
    expect(postMessageBody('Hi', ['m1'])).toEqual({ body: 'Hi', attachmentMediaIds: ['m1'] });
  });
});

describe('list tab from the URL (spec 01 SF-29)', () => {
  it.each([
    [undefined, 'open'],
    ['open', 'open'],
    ['closed', 'closed'],
    ['resolved', 'open'],
  ])('%s → %s', (value, tab) => {
    expect(parseSupportTab(value)).toBe(tab);
  });
});
