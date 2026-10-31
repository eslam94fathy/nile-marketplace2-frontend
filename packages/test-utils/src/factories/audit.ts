import { defineFactory, fixtureId } from '../factory';

/**
 * `AuditEntryDto` (ids from 27000): an admin changing one seller's commission rate, with a reason-free change of
 * one field (backend spec 20 §2.3 `seller.commission_changed`).
 */
export const auditEntryFactory = defineFactory<'AuditEntryDto'>((sequence) => ({
  id: fixtureId(27000 + sequence),
  actorType: 'admin',
  actor: { userId: fixtureId(27300 + sequence), email: `admin${String(sequence)}@example.test` },
  action: 'seller.commission_changed',
  targetType: 'seller',
  targetId: fixtureId(27600 + sequence),
  changes: { before: { commissionRate: '0.1000' }, after: { commissionRate: '0.1250' } },
  reason: null,
  correlationId: fixtureId(27900 + sequence),
  ip: '203.0.113.7',
  createdAt: '2026-10-30T08:15:00.000Z',
}));
