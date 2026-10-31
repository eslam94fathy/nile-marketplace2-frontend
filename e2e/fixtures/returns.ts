import { randomUUID } from 'node:crypto';
import type { Schema } from '@nile/api';
import { expectData, type Accounts } from '@nile/test-utils/e2e';
import { expect } from './index';
import { deliveredCodOrder } from './orders';

// Release 2 set-up through the API (T-O2, T-O4): returns and support tickets for screens that start mid-workflow.

/** The worker creates the return shipment shortly after the approval (outbox), like the delivery shipment. */
const RETURN_SHIPMENT_WAIT_MS = 15_000;

/** A wallet number for COD refunds in tests (E.164, Egyptian mobile). */
export const TEST_WALLET_NUMBER = '+201012345678';

export interface ReturnTokens {
  readonly customer: string;
  readonly seller: string;
  readonly admin: string;
  readonly agent: string;
}

/**
 * A delivered COD order with one unit returned ("Changed my mind", refund to a mobile wallet) and approved by
 * the seller, its return shipment assigned to `agentId`: the agent's R1 "Collected" is the next step.
 */
export async function assignedReturnPickup(
  backend: Accounts['backend'],
  tokens: ReturnTokens,
  agentId: string,
  variantId: string,
): Promise<{
  readonly order: Schema<'OrderDetailDto'>;
  readonly returnId: string;
  readonly shipmentId: string;
}> {
  const order = await deliveredCodOrder(backend, tokens, agentId, variantId);
  const sellerOrder = order.sellerOrders[0];
  const item = sellerOrder?.items[0];
  if (sellerOrder === undefined || item === undefined) throw new Error('order without items');
  const requested = expectData(
    await backend.request('POST', '/api/v1/returns', {
      token: tokens.customer,
      idempotencyKey: randomUUID(),
      body: {
        sellerOrderId: sellerOrder.id,
        reason: 'changed_mind',
        items: [{ orderItemId: item.id, quantity: 1 }],
        refundPayout: { method: 'mobile_wallet', walletNumber: TEST_WALLET_NUMBER },
      },
    }),
    201,
  ) as Schema<'ReturnDto'>;
  expectData(
    await backend.request('POST', `/api/v1/seller/returns/${requested.id}/approve`, { token: tokens.seller }),
    200,
  );

  let shipment: Schema<'AdminShipmentDto'> | undefined;
  await expect
    .poll(
      async () => {
        const found = expectData(
          await backend.request('GET', `/api/v1/admin/shipments?orderId[eq]=${order.id}&kind[eq]=return`, {
            token: tokens.admin,
          }),
          200,
        ) as Schema<'AdminShipmentDto'>[];
        shipment = found.find((candidate) => candidate.returnId === requested.id);
        return shipment !== undefined;
      },
      { message: 'No return shipment after the approval', timeout: RETURN_SHIPMENT_WAIT_MS },
    )
    .toBe(true);
  if (shipment === undefined) throw new Error('No return shipment after the approval');
  if (shipment.agentId !== agentId) {
    expectData(
      await backend.request('POST', `/api/v1/admin/shipments/${shipment.id}/assign`, {
        token: tokens.admin,
        body: { agentId },
      }),
      200,
    );
  }
  return { order, returnId: requested.id, shipmentId: shipment.id };
}

/** A support ticket opened by a customer through the API ("Other", no order). */
export async function openTicket(
  backend: Accounts['backend'],
  customerToken: string,
  subject: string,
): Promise<Schema<'TicketSummaryDto'>> {
  return expectData(
    await backend.request('POST', '/api/v1/support/tickets', {
      token: customerToken,
      idempotencyKey: randomUUID(),
      body: { category: 'other', subject, body: 'Opened by the tests.' },
    }),
    201,
  ) as Schema<'TicketSummaryDto'>;
}
