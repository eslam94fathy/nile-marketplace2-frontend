// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { fixtureId, mockApi, orderDetailFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { OrderConfirmation } from './order-confirmation';

const server = setupMswServer();
const ORDER_ID = fixtureId(0x900);

function order(overrides: Partial<Schema<'OrderDetailDto'>> = {}): Schema<'OrderDetailDto'> {
  const base = orderDetailFactory({ id: ORDER_ID, orderNumber: 'NM-2026-000001' });
  return {
    ...base,
    shippingAddress: { ...base.shippingAddress, floor: '3' },
    sellerOrders: [
      {
        id: fixtureId(0x901),
        sellerId: fixtureId(0x600),
        businessName: 'Nile Crafts',
        status: 'placed',
        subtotal: '500.00',
        discountAmount: '0.00',
        discountFunding: null,
        returnedPaid: '0.00',
        cancelReason: null,
        canCancel: true,
        timeline: [],
        items: [
          {
            id: fixtureId(0x902),
            productId: fixtureId(0x702),
            variantId: fixtureId(0x701),
            productName: 'Linen shirt',
            sku: 'LIN-M',
            attributes: [{ attribute: 'Size', value: 'M' }],
            unitPrice: '250.00',
            quantity: 2,
            cancelledQuantity: 0,
            lineTotal: '500.00',
            returnedQuantity: 0,
            discountAmount: '0.00',
            paidTotal: '500.00',
            image: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function serveOrder(answer: Schema<'OrderDetailDto'> | 'not-found' | 'error') {
  server.use(
    mockApi(
      'get',
      '/orders/{orderId}',
      ({ reply }) =>
        answer === 'not-found'
          ? reply.error(404, 'ORDER_NOT_FOUND')
          : answer === 'error'
            ? reply.error(500, 'INTERNAL_ERROR')
            : reply.ok(answer),
      { base: BFF_BASE },
    ),
  );
}

describe('order confirmation (spec 01 SF-08)', { timeout: 15_000 }, () => {
  it('thanks, the cash amount, per-seller items with their status, the address and the links', async () => {
    serveOrder(order());
    renderWithProviders(<OrderConfirmation orderId={ORDER_ID} />);
    expect(await screen.findByText('Thank you. Your order NM-2026-000001 is placed.')).toBeDefined();
    expect(screen.getByText(/^Pay .*545\.00 in cash on delivery\.$/)).toBeDefined();
    const group = screen.getByRole('region', { name: 'Sold by Nile Crafts' });
    expect(within(group).getByText('Waiting for seller confirmation')).toBeDefined();
    expect(within(group).getByText('Size: M')).toBeDefined();
    expect(screen.getByText('12, Abbas El Akkad, District 7, Nasr City, Cairo')).toBeDefined();
    expect(screen.getByText('Floor 3')).toBeDefined();
    expect(screen.getByRole('link', { name: 'View order' }).getAttribute('href')).toBe(
      `/account/orders/${ORDER_ID}`,
    );
    expect(screen.getByRole('link', { name: 'Continue shopping' }).getAttribute('href')).toBe('/');
  });

  it('visited later: the current status instead of "is placed"', async () => {
    serveOrder(order({ status: 'cancelled' }));
    renderWithProviders(<OrderConfirmation orderId={ORDER_ID} />);
    expect(await screen.findByText('Order NM-2026-000001: Cancelled')).toBeDefined();
    expect(screen.queryByText(/Thank you/)).toBeNull();
  });

  it('someone else’s or an unknown order: not found', async () => {
    serveOrder('not-found');
    renderWithProviders(<OrderConfirmation orderId={ORDER_ID} />);
    expect(await screen.findByRole('heading', { level: 1, name: /not found/i })).toBeDefined();
  });

  it('a malformed id in the URL (VALIDATION_FAILED): not found (regression)', async () => {
    server.use(
      mockApi('get', '/orders/{orderId}', ({ reply }) => reply.error(400, 'VALIDATION_FAILED'), {
        base: BFF_BASE,
      }),
    );
    renderWithProviders(<OrderConfirmation orderId="not-an-order" />);
    expect(await screen.findByRole('heading', { level: 1, name: /not found/i })).toBeDefined();
  });

  it('a failed load offers a retry', async () => {
    serveOrder('error');
    renderWithProviders(<OrderConfirmation orderId={ORDER_ID} />);
    expect(await screen.findByText("Your order couldn't be loaded.")).toBeDefined();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeDefined();
  });
});
