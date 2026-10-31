import { describe, expect, it } from 'vitest';
import { SELLER_ORDER_STATUSES, SHIPMENT_STATUSES, type AttemptFailureReason } from '../enums';
import { agentShipmentActions, canHandBackToSeller, type AgentShipmentState } from './agent-shipment';
import { sellerOrderActions } from './seller-order';

describe('sellerOrderActions (spec 02 SE-15)', () => {
  it.each([
    ['placed', ['accept', 'cancel_order', 'cancel_items']],
    ['accepted', ['mark_ready', 'cancel_order', 'cancel_items']],
    ['ready_for_pickup', ['cancel_order', 'cancel_items']],
    ['returning_to_seller', ['confirm_return']],
  ] as const)('%s → %j', (status, actions) => {
    expect(sellerOrderActions(status)).toEqual(actions);
  });

  it('offers nothing in every other status', () => {
    const withActions = new Set(['placed', 'accepted', 'ready_for_pickup', 'returning_to_seller']);
    for (const status of SELLER_ORDER_STATUSES.filter((value) => !withActions.has(value))) {
      expect(sellerOrderActions(status)).toEqual([]);
    }
  });
});

describe('agentShipmentActions (spec 04 AG-05)', () => {
  const shipment = (
    status: AgentShipmentState['status'],
    reasons: AttemptFailureReason[] = [],
    kind: AgentShipmentState['kind'] = 'delivery',
  ): AgentShipmentState => ({
    kind,
    status,
    attemptCount: reasons.length,
    attempts: reasons.map((reason) => ({ reason })),
  });

  it.each([
    ['assigned', 'picked_up', null],
    ['picked_up', 'start_delivery', null],
    ['out_for_delivery', 'delivered', 'delivery_failed'],
    ['delivery_failed', 'start_next_attempt', null],
  ] as const)('%s → primary %s, secondary %s', (status, primary, secondary) => {
    expect(
      agentShipmentActions(shipment(status, status === 'delivery_failed' ? ['wrong_address'] : [])),
    ).toEqual({
      primary,
      secondary,
    });
  });

  it.each(['unassigned', 'returned_to_seller', 'delivered', 'cancelled', 'pickup_failed'] as const)(
    '%s is read-only',
    (status) => {
      expect(agentShipmentActions(shipment(status))).toEqual({ primary: null, secondary: null });
    },
  );

  it.each([
    ['assigned', 'collected', 'pickup_failed'],
    ['pickup_failed', 'collected', 'pickup_failed'],
    ['picked_up', 'handed_to_seller', null],
  ] as const)(
    'a return pickup %s → primary %s, secondary %s (spec 04 §7.3)',
    (status, primary, secondary) => {
      expect(agentShipmentActions(shipment(status, [], 'return'))).toEqual({ primary, secondary });
    },
  );

  it('never offers delivery actions on a return pickup, whatever its status', () => {
    const delivery = new Set([
      'picked_up',
      'start_delivery',
      'start_next_attempt',
      'delivered',
      'delivery_failed',
      'handed_back',
    ]);
    for (const status of SHIPMENT_STATUSES) {
      const { primary, secondary } = agentShipmentActions(shipment(status, [], 'return'));
      expect(delivery.has(primary ?? '')).toBe(false);
      expect(delivery.has(secondary ?? '')).toBe(false);
    }
    for (const status of ['delivered', 'cancelled'] as const) {
      expect(agentShipmentActions(shipment(status, [], 'return'))).toEqual({
        primary: null,
        secondary: null,
      });
    }
  });

  it('never offers more than one primary action, for any status', () => {
    for (const status of SHIPMENT_STATUSES) {
      const actions = agentShipmentActions(shipment(status));
      expect(actions.secondary === null || actions.primary !== null).toBe(true);
    }
  });

  describe('returning to seller (AG-Q-1 inference)', () => {
    it('offers "handed back" after a post-pickup cancellation (no refusal, < 3 attempts)', () => {
      expect(agentShipmentActions(shipment('returning_to_seller')).primary).toBe('handed_back');
      expect(
        agentShipmentActions(shipment('returning_to_seller', ['customer_unreachable', 'wrong_address']))
          .primary,
      ).toBe('handed_back');
    });

    it('offers nothing after a refusal: the seller closes a normal return', () => {
      expect(agentShipmentActions(shipment('returning_to_seller', ['customer_refused']))).toEqual({
        primary: null,
        secondary: null,
      });
    });

    it('offers nothing after the third failed attempt', () => {
      const third = shipment('returning_to_seller', [
        'customer_unreachable',
        'customer_rescheduled',
        'wrong_address',
      ]);
      expect(canHandBackToSeller(third)).toBe(false);
      expect(agentShipmentActions(third).primary).toBeNull();
    });

    it('is never true outside returning_to_seller', () => {
      expect(canHandBackToSeller(shipment('delivery_failed', ['wrong_address']))).toBe(false);
    });
  });
});
