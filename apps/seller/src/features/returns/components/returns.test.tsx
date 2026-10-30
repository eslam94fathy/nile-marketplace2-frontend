// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import { fixtureId, mockApi, sellerProfileFactory, sellerReturnFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { ReturnDetail } from './return-detail';
import { ReturnQueue } from './return-queue';
import { ReturnsList } from './returns-list';

const server = setupMswServer();

type Return = Schema<'SellerReturnDto'>;

const PAGE = { nextCursor: null, hasMore: false, limit: 20 };
const REQUESTED = sellerReturnFactory({ returnNumber: 'RT-7', orderNumber: 'NM-7' });
const SECOND_ITEM = {
  id: fixtureId(18999),
  orderItemId: fixtureId(18998),
  productName: 'Tea mug',
  attributes: [],
  image: null,
  quantity: 2,
  paidAmount: '80.00',
  restock: null,
};
const RECEIVED: Return = {
  ...REQUESTED,
  status: 'received',
  sellerDecisionDeadlineAt: null,
  inspectionDeadlineAt: '2999-01-03T10:00:00.000Z',
  items: [...REQUESTED.items, SECOND_ITEM],
};

function serveProfile(status: Schema<'SellerProfileDto'>['status'] = 'approved') {
  server.use(
    mockApi('get', '/seller/profile', ({ reply }) => reply.ok(sellerProfileFactory({ status })), {
      base: BFF_BASE,
    }),
  );
}

/** `GET /seller/returns/{id}` answers with the current state; counts the calls. */
function serveReturn(initial: Return | 'missing') {
  const state = { item: initial, calls: 0 };
  server.use(
    mockApi(
      'get',
      '/seller/returns/{returnId}',
      ({ reply }) => {
        state.calls += 1;
        return state.item === 'missing' ? reply.error(404, 'RETURN_NOT_FOUND') : reply.ok(state.item);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

function serveList(rows: Return[]) {
  const queries: URLSearchParams[] = [];
  server.use(
    mockApi(
      'get',
      '/seller/returns',
      ({ request, reply }) => {
        queries.push(new URL(request.url).searchParams);
        return reply.ok(rows, PAGE);
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

const fail = (status: number, code: ErrorCode) =>
  HttpResponse.json({ success: false, error: { code, message: code }, correlationId: 'corr-1' }, { status });
const ok = (data: unknown) => HttpResponse.json({ success: true, data });

/** A POST action; records bodies and idempotency keys. */
function serveAction(action: string, answer: (call: number) => Response) {
  const calls: { body: unknown; key: string | null }[] = [];
  server.use(
    http.post(`${BFF_BASE}/seller/returns/${REQUESTED.id}/${action}`, async ({ request }) => {
      const text = await request.text();
      calls.push({
        body: text === '' ? null : (JSON.parse(text) as unknown),
        key: request.headers.get('Idempotency-Key'),
      });
      return answer(calls.length);
    }),
  );
  return calls;
}

const renderDetail = () =>
  renderWithProviders(
    <>
      <ReturnDetail returnId={REQUESTED.id} />
      <Toaster />
    </>,
  );

const heading = () => screen.findByRole('heading', { level: 1, name: 'Return RT-7' });

async function enabledButton(name: string) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => {
    expect(button.hasAttribute('disabled')).toBe(false);
  });
  return button;
}

beforeEach(() => {
  serveProfile();
});

describe('returns list (spec 02 SE-18)', { timeout: 15_000 }, () => {
  it('"To decide" by default: requested, nearest deadline first; rows link the return and the order', async () => {
    const queries = serveList([REQUESTED]);
    renderWithProviders(<ReturnsList tab={null} />);
    const table = await screen.findByRole('table', { name: 'Your returns' });
    const row = (await within(table).findByRole('link', { name: 'Return RT-7' })).closest(
      'tr',
    ) as HTMLElement;
    expect(within(row).getByRole('link', { name: 'Return RT-7' }).getAttribute('href')).toBe(
      `/returns/${REQUESTED.id}`,
    );
    expect(within(row).getByRole('link', { name: 'Order NM-7' }).getAttribute('href')).toBe(
      `/orders/${REQUESTED.sellerOrderId}`,
    );
    expect(within(row).getByText('Damaged')).toBeDefined();
    expect(within(row).getByText('1 item')).toBeDefined();
    expect(within(row).getAllByText('To decide').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: 'To decide' }).getAttribute('aria-current')).toBe('page');
    expect(queries[0]?.get('status[eq]')).toBe('requested');
    expect(queries[0]?.get('sort')).toBe('sellerDecisionDeadlineAt');
    expect(queries[0]?.get('limit')).toBe('20');
  });

  it('"In progress" asks for its statuses newest first; empty text per tab', async () => {
    const queries = serveList([]);
    renderWithProviders(<ReturnsList tab="in-progress" />);
    expect(await screen.findByText('No returns in progress.')).toBeDefined();
    expect(queries[0]?.get('status[in]')).toBe('rejected,escalated,approved,picked_up,disputed');
    expect(queries[0]?.get('sort')).toBe('-createdAt');
  });
});

describe('return detail (spec 02 SE-19)', { timeout: 15_000 }, () => {
  it('content: reason with the fee note, description, items, refund; no customer contact data', async () => {
    serveReturn(REQUESTED);
    renderDetail();
    await heading();
    expect(screen.getByText('Damaged')).toBeDefined();
    expect(screen.getByText(/^You pay the return delivery fee of .*30\.00\.$/)).toBeDefined();
    expect(screen.getByText('The handle broke.')).toBeDefined();
    expect(screen.getByText('Linen shirt')).toBeDefined();
    expect(screen.getByText('Size: M')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Order NM-7' }).getAttribute('href')).toBe(
      `/orders/${REQUESTED.sellerOrderId}`,
    );
    expect(screen.queryByText(/phone|address/i)).toBeNull();
  });

  it('a return of another seller: not found, with a way back', async () => {
    serveReturn('missing');
    renderDetail();
    expect(await screen.findByText("This return doesn't exist.")).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to returns' }).getAttribute('href')).toBe('/returns');
  });

  it('Approve asks first and shows the answer', async () => {
    const state = serveReturn(REQUESTED);
    serveAction('approve', () => {
      state.item = { ...REQUESTED, status: 'approved', sellerDecisionDeadlineAt: null };
      return ok(state.item);
    });
    const view = renderDetail();
    await view.user.click(await enabledButton('Approve'));
    const dialog = await screen.findByRole('dialog', { name: 'Approve return' });
    await view.user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Return approved.')).toBeDefined();
    expect(screen.getAllByText('Approved, awaiting pickup').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('Reject needs a reason (3..500), sent trimmed', async () => {
    serveReturn(REQUESTED);
    const calls = serveAction('reject', () => ok({ ...REQUESTED, status: 'rejected' }));
    const view = renderDetail();
    await view.user.click(await enabledButton('Reject'));
    const dialog = await screen.findByRole('dialog', { name: 'Reject return' });
    expect(within(dialog).getByText('The customer can ask Nile to review your decision.')).toBeDefined();
    const reason = within(dialog).getByRole('textbox', { name: /Why are you rejecting it\?/ });
    await view.user.type(reason, 'no');
    await view.user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(await within(dialog).findByText('Must be at least 3 characters.')).toBeDefined();
    expect(calls).toHaveLength(0);
    await view.user.clear(reason);
    await view.user.type(reason, '  Used item  ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() => {
      expect(calls.map((call) => call.body)).toEqual([{ reason: 'Used item' }]);
    });
  });

  it('RETURN_INVALID_STATUS_TRANSITION: reads the return again and explains', async () => {
    const state = serveReturn(REQUESTED);
    serveAction('approve', () => fail(409, 'RETURN_INVALID_STATUS_TRANSITION'));
    const view = renderDetail();
    await view.user.click(await enabledButton('Approve'));
    const dialog = await screen.findByRole('dialog', { name: 'Approve return' });
    await view.user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(
      await screen.findByText(
        'This return was already updated (for example approved automatically when the deadline passed).',
      ),
    ).toBeDefined();
    await waitFor(() => {
      expect(state.calls).toBe(2);
    });
  });

  it('past the decision deadline: no actions', async () => {
    serveReturn({ ...REQUESTED, sellerDecisionDeadlineAt: '2020-01-01T00:00:00.000Z' });
    renderDetail();
    await heading();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });

  it('a suspended seller can still decide; a pending one sees the actions disabled with the reason', async () => {
    serveProfile('suspended');
    serveReturn(REQUESTED);
    const view = renderDetail();
    expect(await enabledButton('Approve')).toBeDefined();
    view.unmount();
    serveProfile('pending_approval');
    renderDetail();
    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => {
      expect(approve.hasAttribute('disabled')).toBe(true);
    });
    expect(approve.getAttribute('aria-describedby')).not.toBeNull();
  });

  it('Confirm receipt: every item once, restock on by default; a retry reuses the key', async () => {
    serveReturn(RECEIVED);
    const calls = serveAction('confirm-receipt', (call) =>
      call === 1 ? fail(500, 'INTERNAL_ERROR') : ok({ ...RECEIVED, status: 'completed' }),
    );
    const view = renderDetail();
    await view.user.click(await enabledButton('Confirm receipt'));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm receipt' });
    expect(
      within(dialog).getByText(/^The customer is refunded once you confirm\. If you don't respond by /),
    ).toBeDefined();
    const mug = within(dialog).getByRole('checkbox', { name: 'Put Tea mug back in stock' });
    expect(mug.getAttribute('aria-checked')).toBe('true');
    await view.user.click(mug);
    await view.user.click(within(dialog).getByRole('button', { name: 'Confirm receipt' }));
    expect(await within(dialog).findByRole('alert')).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Confirm receipt' }));
    expect(await screen.findByText('Receipt confirmed.')).toBeDefined();
    expect(calls).toHaveLength(2);
    expect(calls[0]?.body).toEqual({
      items: [
        { returnItemId: REQUESTED.items[0]?.id, restock: true },
        { returnItemId: SECOND_ITEM.id, restock: false },
      ],
    });
    expect(calls[1]?.key).toBe(calls[0]?.key);
    expect(calls[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('RETURN_ITEMS_MISMATCH: reads the return again and keeps the dialog open with a note', async () => {
    const state = serveReturn(RECEIVED);
    serveAction('confirm-receipt', () => fail(422, 'RETURN_ITEMS_MISMATCH'));
    const view = renderDetail();
    await view.user.click(await enabledButton('Confirm receipt'));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm receipt' });
    await view.user.click(within(dialog).getByRole('button', { name: 'Confirm receipt' }));
    expect(
      await within(dialog).findByText('The items of this return changed. Check them and confirm again.'),
    ).toBeDefined();
    await waitFor(() => {
      expect(state.calls).toBe(2);
    });
  });

  it('Report a problem: the reason only when no photos; the note', async () => {
    serveReturn(RECEIVED);
    const calls = serveAction('dispute', () => ok({ ...RECEIVED, status: 'disputed' }));
    const view = renderDetail();
    await view.user.click(await enabledButton('Report a problem'));
    const dialog = await screen.findByRole('dialog', { name: 'Report a problem' });
    expect(
      within(dialog).getByText('Nile will review and decide whether the customer is refunded.'),
    ).toBeDefined();
    await view.user.type(
      within(dialog).getByRole('textbox', { name: /What's wrong with the returned items\?/ }),
      'Different item inside',
    );
    await view.user.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Sent to Nile for review.')).toBeDefined();
    expect(calls.map((call) => call.body)).toEqual([{ reason: 'Different item inside' }]);
  });

  it('RETURN_INSPECTION_WINDOW_CLOSED: explains and reads the return again', async () => {
    const state = serveReturn(RECEIVED);
    serveAction('dispute', () => fail(422, 'RETURN_INSPECTION_WINDOW_CLOSED'));
    const view = renderDetail();
    await view.user.click(await enabledButton('Report a problem'));
    const dialog = await screen.findByRole('dialog', { name: 'Report a problem' });
    await view.user.type(within(dialog).getByRole('textbox', { name: /What's wrong/ }), 'Broken');
    await view.user.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('The time to report a problem has passed.')).toBeDefined();
    await waitFor(() => {
      expect(state.calls).toBe(2);
    });
  });
});

describe('overview return queues (spec 02 SE-06, SE-Q-11)', { timeout: 15_000 }, () => {
  it('to decide: the deadline queue with a link to the tab; hidden when empty', async () => {
    const queries = serveList([REQUESTED]);
    const view = renderWithProviders(<ReturnQueue queue="toDecide" />);
    expect(await screen.findByRole('heading', { name: 'Returns to decide' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Return RT-7' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'See all returns to decide' }).getAttribute('href')).toBe(
      '/returns?tab=to-decide',
    );
    expect(queries[0]?.get('status[eq]')).toBe('requested');
    expect(queries[0]?.get('sort')).toBe('sellerDecisionDeadlineAt');
    expect(queries[0]?.get('limit')).toBe('5');
    view.unmount();
    serveList([]);
    const empty = renderWithProviders(<ReturnQueue queue="toCheck" />);
    await waitFor(() => {
      expect(empty.container.querySelector('section')).toBeNull();
    });
  });

  it('to check: "Check the returned items by {deadline}"', async () => {
    serveList([RECEIVED]);
    renderWithProviders(<ReturnQueue queue="toCheck" />);
    expect(await screen.findByRole('heading', { name: 'Returns to check' })).toBeDefined();
    expect(screen.getByText(/^Check the returned items by /)).toBeDefined();
  });
});
