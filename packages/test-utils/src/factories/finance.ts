import { defineFactory, fixtureId } from '../factory';

/** `AccountDto`: a seller's payable of 1250.00. Ids start at 16000. */
export const financeAccountFactory = defineFactory<'AccountDto'>((sequence) => ({
  id: fixtureId(16000 + sequence),
  accountType: 'seller_payable',
  ownerId: fixtureId(9601),
  ownerName: 'Nile Crafts',
  balance: '1250.00',
  updatedAt: '2026-10-15T12:00:00.000Z',
}));

/** `LedgerEntryDto`: seller earnings of 225.00 from a seller order. Ids start at 16500. */
export const ledgerEntryFactory = defineFactory<'LedgerEntryDto'>((sequence) => ({
  id: fixtureId(16500 + sequence),
  direction: 'credit',
  amount: '225.00',
  balanceAfter: '1250.00',
  entryType: 'seller_net_earned',
  referenceType: 'seller_order',
  referenceId: fixtureId(14501),
  createdAt: '2026-10-15T12:00:00.000Z',
}));

/** `RemittanceDto`: 300.00 handed in by agent 10001. Ids start at 17000. */
export const remittanceFactory = defineFactory<'RemittanceDto'>((sequence) => ({
  id: fixtureId(17000 + sequence),
  agentId: fixtureId(10001),
  amount: '300.00',
  confirmedByUserId: fixtureId(9501),
  note: null,
  createdAt: '2026-10-15T15:00:00.000Z',
}));

/** `PayoutDto`: 1000.00 paid to seller 9601. Ids start at 17500. */
export const payoutFactory = defineFactory<'PayoutDto'>((sequence) => ({
  id: fixtureId(17500 + sequence),
  payeeType: 'seller',
  payeeId: fixtureId(9601),
  amount: '1000.00',
  externalReference: `TRX-${sequence}`,
  recordedByUserId: fixtureId(9501),
  paidAt: '2026-10-15T09:00:00.000Z',
  createdAt: '2026-10-15T09:05:00.000Z',
}));
