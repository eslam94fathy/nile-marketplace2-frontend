// @vitest-environment jsdom
import type * as Media from '@nile/media';
import { mockApi, ticketFactory } from '@nile/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OpenTicketBody } from '../api';
import { makeConfig, orderChoicesFrom, renderSupport, setupMswServer } from '../test/harness';
import { NewTicketForm } from './new-ticket-form';

/** The first render of a file also loads its modules: more time than the 1 s default on a busy machine. */
const FIRST_RENDER = { timeout: 5000 };

// Uploads have their own tests in @nile/media; here the form only needs ready ids and the attachable mark.
const uploads = vi.hoisted(() => ({ readyMediaIds: [] as string[], markNotAttachable: vi.fn() }));
vi.mock('@nile/media', async (importOriginal) => ({
  ...(await importOriginal<typeof Media>()),
  useImageUploads: () => ({
    tiles: [],
    refusals: [],
    announcement: '',
    readyMediaIds: uploads.readyMediaIds,
    busy: false,
    canAddMore: true,
    add: vi.fn(),
    remove: vi.fn(),
    retry: vi.fn(),
    markNotAttachable: uploads.markNotAttachable,
    clear: vi.fn(),
  }),
}));

const server = setupMswServer();

const CHOICES = orderChoicesFrom([
  {
    id: 'o-1',
    orderNumber: '2026-000123',
    sellers: [{ sellerOrderId: 'so-1', businessName: 'Cairo Crafts' }],
  },
  { id: 'o-2', orderNumber: '2026-000124' },
]);

function captureOpen(answer: 'ok' | 'limit' | 'order' | 'category' | 'media' = 'ok') {
  const sent: { body: OpenTicketBody; key: string | null }[] = [];
  server.use(
    mockApi('post', '/support/tickets', async ({ request, reply }) => {
      sent.push({
        body: (await request.json()) as OpenTicketBody,
        key: request.headers.get('Idempotency-Key'),
      });
      if (answer === 'limit') return reply.error(422, 'SUPPORT_OPEN_TICKET_LIMIT_REACHED');
      if (answer === 'order') return reply.error(422, 'ORDER_NOT_FOUND');
      if (answer === 'category') return reply.error(422, 'SUPPORT_CATEGORY_NOT_ALLOWED');
      if (answer === 'media')
        return reply.error(422, 'MEDIA_NOT_ATTACHABLE', {
          details: [
            { field: 'attachmentMediaIds', constraint: 'attachable', message: 'not attachable', value: 'm1' },
          ],
        });
      return reply.created(ticketFactory({ id: 't-new' }));
    }),
  );
  return sent;
}

async function fill(view: ReturnType<typeof renderSupport>) {
  await view.user.type(screen.getByRole('textbox', { name: /^Subject/ }), 'Late parcel');
  await view.user.type(screen.getByRole('textbox', { name: /^Message/ }), 'Where is it?');
}

describe('NewTicketForm (spec 01 SF-30)', () => {
  it('URL order and parcel preselected; sends the ticket once with a key and opens its thread', async () => {
    const sent = captureOpen();
    uploads.readyMediaIds = ['m1'];
    const config = makeConfig({ orderChoices: CHOICES });
    const view = renderSupport(
      <NewTicketForm initial={{ category: 'return', orderId: 'o-1', sellerOrderId: 'so-1' }} />,
      config,
    );

    expect(
      await screen.findByText('About the items sold by Cairo Crafts', undefined, FIRST_RENDER),
    ).toBeDefined();
    expect(screen.getByRole('combobox', { name: /^Category/ }).textContent).toContain('Return');
    expect(screen.getByRole('combobox', { name: /^Order/ }).textContent).toContain('Order 2026-000123');
    await fill(view);
    await view.user.click(screen.getByRole('button', { name: 'Send ticket' }));

    await waitFor(() => {
      expect(config.navigate).toHaveBeenCalledWith('/support/t-new');
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent[0]?.body).toEqual({
      category: 'return',
      subject: 'Late parcel',
      body: 'Where is it?',
      orderId: 'o-1',
      sellerOrderId: 'so-1',
      attachmentMediaIds: ['m1'],
    });
    uploads.readyMediaIds = [];
  });

  it('choosing another order drops the URL parcel', async () => {
    const sent = captureOpen();
    const view = renderSupport(
      <NewTicketForm initial={{ category: 'order', orderId: 'o-1', sellerOrderId: 'so-1' }} />,
      makeConfig({ orderChoices: CHOICES }),
    );
    await view.user.click(await screen.findByRole('combobox', { name: /^Order/ }, FIRST_RENDER));
    await view.user.click(await screen.findByRole('option', { name: 'Order 2026-000124' }));
    expect(screen.queryByText('About the items sold by Cairo Crafts')).toBeNull();
    await fill(view);
    await view.user.click(screen.getByRole('button', { name: 'Send ticket' }));

    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]?.body).toEqual({
      category: 'order',
      subject: 'Late parcel',
      body: 'Where is it?',
      orderId: 'o-2',
    });
  });

  it('a category is required; an unknown URL category is dropped and nothing is sent', async () => {
    const sent = captureOpen();
    const view = renderSupport(
      <NewTicketForm initial={{ category: 'seller_onboarding', orderId: null, sellerOrderId: null }} />,
      makeConfig({ orderChoices: CHOICES }),
    );
    await screen.findByRole('combobox', { name: /^Category/ }, FIRST_RENDER);
    await fill(view);
    await view.user.click(screen.getByRole('button', { name: 'Send ticket' }));
    expect(await screen.findByText('Choose a category.')).toBeDefined();
    expect(sent).toHaveLength(0);
  });

  it.each([
    ['limit', 'You have 20 open tickets. Please wait for replies before opening another.'],
    ['order', 'Choose one of your orders.'],
    ['category', 'Choose another category.'],
  ] as const)('%s refusal: "%s"', async (answer, message) => {
    captureOpen(answer);
    const view = renderSupport(
      <NewTicketForm initial={{ category: 'order', orderId: 'o-2', sellerOrderId: null }} />,
      makeConfig({ orderChoices: CHOICES }),
    );
    await screen.findByRole('combobox', { name: /^Order/ }, FIRST_RENDER);
    await fill(view);
    await view.user.click(screen.getByRole('button', { name: 'Send ticket' }));
    expect(await screen.findByText(message)).toBeDefined();
  });

  it('MEDIA_NOT_ATTACHABLE marks the photos the API named', async () => {
    captureOpen('media');
    uploads.readyMediaIds = ['m1'];
    const view = renderSupport(
      <NewTicketForm initial={{ category: 'other', orderId: null, sellerOrderId: null }} />,
      makeConfig({ orderChoices: CHOICES }),
    );
    await screen.findByRole('combobox', { name: /^Order/ }, FIRST_RENDER);
    await fill(view);
    await view.user.click(screen.getByRole('button', { name: 'Send ticket' }));
    await waitFor(() => {
      expect(uploads.markNotAttachable).toHaveBeenCalledWith(['m1']);
    });
    uploads.readyMediaIds = [];
  });

  it('without an order select (seller): no order field, only the URL parcel is sent', async () => {
    const sent = captureOpen();
    const view = renderSupport(
      <NewTicketForm initial={{ category: 'order', orderId: null, sellerOrderId: 'so-9' }} />,
    );
    await screen.findByRole('combobox', { name: /^Category/ }, FIRST_RENDER);
    expect(screen.queryByRole('combobox', { name: /^Order/ })).toBeNull();
    await fill(view);
    await view.user.click(screen.getByRole('button', { name: 'Send ticket' }));
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]?.body).toEqual({
      category: 'order',
      subject: 'Late parcel',
      body: 'Where is it?',
      sellerOrderId: 'so-9',
    });
  });
});
