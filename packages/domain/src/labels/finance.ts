import type { AccountType, LedgerEntryType, LedgerReferenceType } from '../enums';
import type { Labels } from './types';

/** Spec 03 §4.2. */
export const ACCOUNT_TYPE_LABELS = {
  seller_payable: 'Seller balance',
  agent_fee_payable: 'Agent fee balance',
  agent_cod_cash: 'Agent COD cash',
  platform_commission_revenue: 'Commission revenue',
  platform_delivery_revenue: 'Delivery revenue',
} as const satisfies Labels<AccountType>;

/** Spec 03 §4.2. */
export const LEDGER_ENTRY_TYPE_LABELS = {
  seller_net_earned: 'Seller earnings',
  commission_earned: 'Commission',
  agent_fee_earned: 'Agent fee share',
  platform_fee_earned: 'Delivery fee kept',
  cod_cash_collected: 'COD cash collected',
  cod_cash_remitted: 'COD cash handed in',
  seller_payout: 'Seller payout',
  agent_payout: 'Agent payout',
} as const satisfies Labels<LedgerEntryType>;

/** Spec 03 AD-22 reference type options. */
export const LEDGER_REFERENCE_TYPE_LABELS = {
  seller_order: 'Seller order',
  order: 'Order',
  cod_remittance: 'COD remittance',
  payout: 'Payout',
} as const satisfies Labels<LedgerReferenceType>;
