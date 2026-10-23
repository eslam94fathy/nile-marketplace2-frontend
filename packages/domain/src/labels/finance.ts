import type { AccountType, LedgerEntryType, LedgerReferenceType } from '../enums';
import type { Labels } from './types';

/** Spec 03 §4.2 and §7.6. */
export const ACCOUNT_TYPE_LABELS = {
  seller_payable: 'Seller balance',
  agent_fee_payable: 'Agent fee balance',
  agent_cod_cash: 'Agent COD cash',
  platform_commission_revenue: 'Commission revenue',
  platform_delivery_revenue: 'Delivery revenue',
  seller_pending: 'Seller pending earnings',
  customer_refund_payable: 'Customer refunds owed',
  platform_promotions: 'Promotions (Nile-funded discounts)',
} as const satisfies Labels<AccountType>;

/** Spec 03 §4.2 and §7.6. */
export const LEDGER_ENTRY_TYPE_LABELS = {
  seller_net_earned: 'Seller earnings',
  commission_earned: 'Commission',
  agent_fee_earned: 'Agent fee share',
  platform_fee_earned: 'Delivery fee kept',
  cod_cash_collected: 'COD cash collected',
  cod_cash_remitted: 'COD cash handed in',
  seller_payout: 'Seller payout',
  agent_payout: 'Agent payout',
  seller_net_held: 'Seller earnings held',
  seller_net_released: 'Seller earnings released',
  seller_net_reversed: 'Seller earnings reversed (return)',
  commission_reversed: 'Commission reversed (return)',
  return_fee_charged: 'Return fee charged',
  return_fee_earned: 'Return fee earned',
  customer_refund_owed: 'Customer refund owed',
  customer_refund_paid: 'Customer refund paid',
  promotion_funded: 'Discount funded by Nile',
  promotion_reversed: 'Discount reversed (return)',
} as const satisfies Labels<LedgerEntryType>;

/** Spec 03 AD-22 reference type options and §7.6. */
export const LEDGER_REFERENCE_TYPE_LABELS = {
  seller_order: 'Seller order',
  order: 'Order',
  cod_remittance: 'COD remittance',
  payout: 'Payout',
  return: 'Return',
  refund: 'Refund',
  seller_order_hold: 'Seller order hold',
} as const satisfies Labels<LedgerReferenceType>;
