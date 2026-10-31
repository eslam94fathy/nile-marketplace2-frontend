import { adminAgentFactory, adminShipmentFactory, fixtureId } from '@nile/test-utils';
import { describe, expect, it } from 'vitest';
import { assignCandidates, isAssignable } from './assign';
import { parseShipmentFilters, shipmentApiQuery, shipmentFiltersQuery } from './list-params';

const AGENT = fixtureId(10001);
const ORDER = fixtureId(11501);

describe('shipment filters (spec 03 AD-12)', () => {
  it('no tab is Unassigned, oldest first', () => {
    const filters = parseShipmentFilters({});
    expect(filters.tab).toBe('unassigned');
    expect(shipmentApiQuery(filters)).toEqual({ sort: 'createdAt', 'status[eq]': 'unassigned' });
    expect(shipmentFiltersQuery(filters)).toBe('');
  });

  it('In delivery is four statuses with [in] (a failed return pickup too); other tabs newest first; All has no status', () => {
    expect(shipmentApiQuery(parseShipmentFilters({ status: 'in-delivery' }))).toEqual({
      sort: '-createdAt',
      'status[in]': 'picked_up,out_for_delivery,delivery_failed,pickup_failed',
    });
    expect(shipmentApiQuery(parseShipmentFilters({ status: 'returned' }))).toEqual({
      sort: '-createdAt',
      'status[eq]': 'returned_to_seller',
    });
    expect(shipmentApiQuery(parseShipmentFilters({ status: 'all' }))).toEqual({ sort: '-createdAt' });
  });

  it('type, agent, order and Cairo days go to the API; the URL round-trips', () => {
    const filters = parseShipmentFilters({
      status: 'all',
      kind: 'return',
      agent: AGENT,
      order: ORDER,
      from: '2026-10-01',
      to: '2026-10-02',
    });
    expect(shipmentApiQuery(filters)).toEqual({
      sort: '-createdAt',
      'kind[eq]': 'return',
      'agentId[eq]': AGENT,
      'orderId[eq]': ORDER,
      'createdAt[gte]': '2026-09-30T21:00:00.000Z',
      'createdAt[lte]': '2026-10-02T20:59:59.999Z',
    });
    expect(
      parseShipmentFilters(Object.fromEntries(new URLSearchParams(shipmentFiltersQuery(filters)))),
    ).toEqual(filters);
  });

  it('drops invalid values: unknown tab, non-uuid ids, bad days, an end before the start', () => {
    expect(
      parseShipmentFilters({ status: 'lost', agent: 'x', order: '1', from: '2026-13-01', to: 'y' }),
    ).toEqual({ tab: 'unassigned', kind: null, agentId: null, orderId: null, from: null, to: null });
    expect(parseShipmentFilters({ kind: 'parcel' }).kind).toBeNull();
    expect(parseShipmentFilters({ from: '2026-10-05', to: '2026-10-01' }).to).toBeNull();
  });
});

describe('assignment (spec 03 AD-13)', () => {
  it('only before pickup', () => {
    expect(isAssignable({ status: 'unassigned' })).toBe(true);
    expect(isAssignable({ status: 'assigned' })).toBe(true);
    expect(isAssignable({ status: 'picked_up' })).toBe(false);
    expect(isAssignable({ status: 'delivered' })).toBe(false);
  });

  it('active agents except the current one; pickup governorate + on shift first, API order kept', () => {
    const shipment = adminShipmentFactory({ agentId: fixtureId(10003) });
    const here = shipment.pickup.governorateId;
    const elsewhere = fixtureId(9799);
    const offShiftHere = adminAgentFactory({ id: fixtureId(10001), homeGovernorateId: here });
    const onShiftElsewhere = adminAgentFactory({
      id: fixtureId(10002),
      onShift: true,
      homeGovernorateId: elsewhere,
    });
    const current = adminAgentFactory({ id: fixtureId(10003), onShift: true, homeGovernorateId: here });
    const inactive = adminAgentFactory({ id: fixtureId(10004), status: 'inactive', homeGovernorateId: here });
    const preferred = adminAgentFactory({ id: fixtureId(10005), onShift: true, homeGovernorateId: here });
    expect(
      assignCandidates([offShiftHere, onShiftElsewhere, current, inactive, preferred], shipment).map(
        (agent) => agent.id,
      ),
    ).toEqual([preferred.id, offShiftHere.id, onShiftElsewhere.id]);
  });

  it('a return shipment prefers agents where the customer is (the drop-off governorate)', () => {
    const delivery = adminShipmentFactory();
    const customerGovernorate = fixtureId(9798);
    const shipment = {
      ...delivery,
      kind: 'return' as const,
      dropoff: { ...delivery.dropoff, governorateId: customerGovernorate },
    };
    const atSeller = adminAgentFactory({
      id: fixtureId(10011),
      onShift: true,
      homeGovernorateId: delivery.pickup.governorateId,
    });
    const atCustomer = adminAgentFactory({
      id: fixtureId(10012),
      onShift: true,
      homeGovernorateId: customerGovernorate,
    });
    expect(assignCandidates([atSeller, atCustomer], shipment).map((agent) => agent.id)).toEqual([
      atCustomer.id,
      atSeller.id,
    ]);
  });
});
