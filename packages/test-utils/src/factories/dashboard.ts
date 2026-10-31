import { defineFactory, fixtureId } from '../factory';

const DAYS = 30;
const FIRST_DAY_MS = Date.UTC(2026, 9, 2);
const DAY_MS = 86_400_000;

/**
 * `DashboardDto`: 30 zero-filled days oldest first (backend spec 20 BO-20) with sales on the last two, two top
 * sellers (ids from 22000) and a few open items in every group.
 */
export const dashboardFactory = defineFactory<'DashboardDto'>(() => ({
  generatedAt: '2026-10-31T08:00:00.000Z',
  orders: {
    byStatus: {
      pending_payment: 2,
      placed: 5,
      accepted: 3,
      ready_for_pickup: 1,
      picked_up: 0,
      out_for_delivery: 4,
      delivery_failed: 1,
      returning_to_seller: 0,
    },
    placedToday: 7,
    placedLast7Days: 41,
  },
  gmv: Array.from({ length: DAYS }, (_, index) => ({
    day: new Date(FIRST_DAY_MS + index * DAY_MS).toISOString().slice(0, 10),
    placed: index === DAYS - 1 ? '1200.00' : index === DAYS - 2 ? '300.00' : '0.00',
    delivered: index === DAYS - 2 ? '150.00' : '0.00',
  })),
  topSellers: [
    { sellerId: fixtureId(22001), businessName: 'Cairo Crafts', deliveredGmv: '5400.00' },
    { sellerId: fixtureId(22002), businessName: 'Delta Linen', deliveredGmv: '1200.50' },
  ],
  sellers: { pendingApproval: 3 },
  support: { open: 2, awaitingAdmin: 6, slaBreached: 1 },
  finance: {
    codOutstanding: '2300.00',
    sellerPayable: '18450.75',
    sellerPending: '6200.00',
    agentFeePayable: '940.00',
    customerRefundPayable: '150.00',
  },
  delivery: { awaitingAssignment: 4, outForDelivery: 9, returnsInProgress: 2 },
  returns: {
    byStatus: {
      requested: 3,
      rejected: 1,
      escalated: 2,
      approved: 1,
      picked_up: 0,
      received: 1,
      disputed: 1,
    },
  },
}));
