import type { Schema } from '@nile/api';
import {
  AGENT_STATUS_LABELS,
  COUPON_FUNDING_LABELS,
  COUPON_SCOPE_LABELS,
  DISCOUNT_TYPE_LABELS,
  formatDateTime,
  formatMoney,
  formatRatePercent,
  ORDER_STATUS_LABELS,
  REFUND_STATUS_LABELS,
  RETURN_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
  SELLER_ORDER_STATUS_LABELS,
  SELLER_STATUS_LABELS,
  TICKET_STATUS_LABELS,
  USER_ROLE_LABELS,
  USER_STATUS_LABELS,
  type AuditTargetType,
} from '@nile/domain';
import { AUDIT_COPY as COPY } from '../copy';

// AD-39 "Changes" as Field · Before · After (AD-Q-17): known fields get their label and their value formatted
// (money, rates, dates, enum labels); an unknown field or value is shown raw, so a new backend field is still
// readable. The fields per action are the backend's allow-list (spec 20 §2.3).

export type AuditChanges = Schema<'AuditChangesDto'>;
export type AuditValue = AuditChanges['before'][string];
type Values = AuditChanges['before'];

type Format = 'money' | 'rate' | 'dateTime' | 'discount' | 'status' | 'labels' | 'raw';
interface FieldSpec {
  readonly label: string;
  readonly format: Format;
  readonly labels?: Readonly<Record<string, string>>;
}

const PAYEE_TYPE_LABELS: Readonly<Record<string, string>> = { seller: 'Seller', agent: 'Agent' };
const COUPON_STATUS_LABELS: Readonly<Record<string, string>> = { active: 'Active', inactive: 'Inactive' };

const FIELDS: Readonly<Record<string, FieldSpec>> = {
  status: { label: 'Status', format: 'status' },
  email: { label: 'Email', format: 'raw' },
  role: { label: 'Role', format: 'labels', labels: USER_ROLE_LABELS },
  commissionRate: { label: 'Commission rate', format: 'rate' },
  defaultCommissionRate: { label: 'Default commission rate', format: 'rate' },
  name: { label: 'Name', format: 'raw' },
  slug: { label: 'Slug', format: 'raw' },
  sortOrder: { label: 'Sort order', format: 'raw' },
  isActive: { label: 'Active', format: 'raw' },
  parentId: { label: 'Parent category', format: 'raw' },
  imageMediaId: { label: 'Image', format: 'raw' },
  imageAltText: { label: 'Image description', format: 'raw' },
  code: { label: 'Code', format: 'raw' },
  categoryId: { label: 'Category', format: 'raw' },
  value: { label: 'Value', format: 'raw' },
  attributeId: { label: 'Attribute', format: 'raw' },
  deliveryFee: { label: 'Delivery fee', format: 'money' },
  agentFeeShareRate: { label: 'Agent fee share', format: 'rate' },
  fullName: { label: 'Full name', format: 'raw' },
  phone: { label: 'Phone', format: 'raw' },
  homeGovernorateId: { label: 'Home governorate', format: 'raw' },
  agentId: { label: 'Agent', format: 'raw' },
  providerRefundRef: { label: 'Refund reference', format: 'raw' },
  assignedAdminUserId: { label: 'Assigned admin', format: 'raw' },
  hidden: { label: 'Hidden', format: 'raw' },
  adminBlocked: { label: 'Blocked by Nile', format: 'raw' },
  decision: { label: 'Decision', format: 'raw' },
  funding: { label: 'Funded by', format: 'labels', labels: COUPON_FUNDING_LABELS },
  sellerId: { label: 'Seller', format: 'raw' },
  discountType: { label: 'Discount type', format: 'labels', labels: DISCOUNT_TYPE_LABELS },
  discountValue: { label: 'Discount', format: 'discount' },
  maxDiscount: { label: 'Maximum discount', format: 'money' },
  minItemsSubtotal: { label: 'Minimum order', format: 'money' },
  scope: { label: 'Applies to', format: 'labels', labels: COUPON_SCOPE_LABELS.admin },
  scopeSellerId: { label: 'Seller (scope)', format: 'raw' },
  scopeCategoryId: { label: 'Category (scope)', format: 'raw' },
  startsAt: { label: 'Starts', format: 'dateTime' },
  endsAt: { label: 'Ends', format: 'dateTime' },
  globalLimit: { label: 'Total uses', format: 'raw' },
  perCustomerLimit: { label: 'Uses per customer', format: 'raw' },
  amount: { label: 'Amount', format: 'money' },
  payeeType: { label: 'Payee type', format: 'labels', labels: PAYEE_TYPE_LABELS },
  payeeId: { label: 'Payee', format: 'raw' },
  externalReference: { label: 'Reference', format: 'raw' },
};

/** The status labels of each target type (admin wording); a target without one shows its status raw. */
const STATUS_LABELS: Partial<Record<AuditTargetType, Readonly<Record<string, string>>>> = {
  user: USER_STATUS_LABELS,
  seller: SELLER_STATUS_LABELS,
  delivery_agent: AGENT_STATUS_LABELS,
  order: ORDER_STATUS_LABELS.admin,
  seller_order: SELLER_ORDER_STATUS_LABELS.admin,
  payment_refund: REFUND_STATUS_LABELS,
  support_ticket: TICKET_STATUS_LABELS.admin,
  review: REVIEW_STATUS_LABELS.admin,
  return_request: RETURN_STATUS_LABELS.admin,
  coupon: COUPON_STATUS_LABELS,
};

export interface ChangeRow {
  readonly field: string;
  readonly label: string;
  /** `null` when the side doesn't record the field (a create has no before, a delete no after). */
  readonly before: string | null;
  readonly after: string | null;
}

/** Formatting must never hide a value: anything a formatter refuses is shown as the API sent it. */
function safely(format: () => string, raw: string): string {
  try {
    return format();
  } catch {
    return raw;
  }
}

function formatValue(field: string, value: AuditValue, side: Values, targetType: AuditTargetType): string {
  if (value === null) return COPY.noValue;
  if (typeof value === 'boolean') return value ? COPY.yes : COPY.no;
  const raw = String(value);
  if (typeof value !== 'string') return raw;
  const spec = FIELDS[field];
  switch (spec?.format) {
    case 'money':
      return safely(() => formatMoney(value), raw);
    case 'rate':
      return safely(() => formatRatePercent(value), raw);
    case 'dateTime':
      return safely(() => formatDateTime(value), raw);
    case 'discount':
      // A percent discount is a rate, a fixed one an amount (spec 19); without the type on this side, raw.
      if (side.discountType === 'percent') return safely(() => formatRatePercent(value), raw);
      if (side.discountType === 'fixed') return safely(() => formatMoney(value), raw);
      return raw;
    case 'status':
      return STATUS_LABELS[targetType]?.[value] ?? raw;
    case 'labels':
      return spec.labels?.[value] ?? raw;
    default:
      return raw;
  }
}

/** One row per recorded field, in the order the API sent them (before first, then fields only after has). */
export function changeRows(changes: AuditChanges, targetType: AuditTargetType): ChangeRow[] {
  const fields = [...new Set([...Object.keys(changes.before), ...Object.keys(changes.after)])];
  return fields.map((field) => {
    const before = changes.before[field];
    const after = changes.after[field];
    return {
      field,
      label: FIELDS[field]?.label ?? field,
      before: before === undefined ? null : formatValue(field, before, changes.before, targetType),
      after: after === undefined ? null : formatValue(field, after, changes.after, targetType),
    };
  });
}
