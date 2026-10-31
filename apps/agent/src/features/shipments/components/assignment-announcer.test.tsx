// @vitest-environment jsdom
import type * as Realtime from '@nile/realtime';
import { fixtureId } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { profileKeys } from '@/features/profile';
import { shipmentKeys } from '../api';
import { SHIPMENTS_INVALIDATION } from '../realtime';
import { AssignmentAnnouncer } from './assignment-announcer';

const realtime = vi.hoisted(() => ({ handlers: new Map<string, Set<(message: unknown) => void>>() }));
vi.mock('@nile/realtime', async (importOriginal) => {
  const { useEffect, useRef } = await import('react');
  return {
    ...(await importOriginal<typeof Realtime>()),
    useRealtimeMessage: (type: string, handler: (message: unknown) => void) => {
      const latest = useRef(handler);
      useEffect(() => {
        latest.current = handler;
      });
      useEffect(() => {
        const listener = (message: unknown) => {
          latest.current(message);
        };
        const set = realtime.handlers.get(type) ?? new Set();
        set.add(listener);
        realtime.handlers.set(type, set);
        return () => {
          set.delete(listener);
        };
      }, [type]);
    },
  };
});

const SHIPMENT = { shipmentId: fixtureId(1), sellerOrderId: fixtureId(2) };

function emit(type: 'shipment.assigned' | 'shipment.unassigned') {
  act(() => {
    for (const listener of realtime.handlers.get(type) ?? []) {
      listener({ type, eventId: fixtureId(9), occurredAt: '2026-10-31T10:00:00.000Z', data: SHIPMENT });
    }
  });
}

describe('live assignments (spec 04 §7.3, T-N2)', () => {
  it('announces a new assignment and a reassignment politely, also the same sentence twice', () => {
    const view = renderWithProviders(<AssignmentAnnouncer />);
    const region = view.container.querySelector('[aria-live="polite"]');
    if (region === null) throw new Error('no live region');
    expect(region.textContent).toBe('');
    emit('shipment.assigned');
    expect(region.textContent).toBe('New pickup assigned. ');
    emit('shipment.assigned');
    expect(region.textContent).toBe('New pickup assigned.');
    emit('shipment.unassigned');
    expect(region.textContent).toBe('A shipment was reassigned. ');
  });

  it('assignments refresh the active lists, the shipment and the active count; updates also the history', () => {
    const expected = [shipmentKeys.active(), shipmentKeys.detail(SHIPMENT.shipmentId), profileKeys.profile()];
    expect(SHIPMENTS_INVALIDATION['shipment.assigned'](SHIPMENT)).toEqual(expected);
    expect(SHIPMENTS_INVALIDATION['shipment.unassigned'](SHIPMENT)).toEqual(expected);
    expect(
      SHIPMENTS_INVALIDATION['shipment.updated']({
        ...SHIPMENT,
        orderId: fixtureId(3),
        status: 'picked_up',
        kind: 'return',
      }),
    ).toEqual([shipmentKeys.active(), shipmentKeys.detail(SHIPMENT.shipmentId), shipmentKeys.history()]);
  });
});
