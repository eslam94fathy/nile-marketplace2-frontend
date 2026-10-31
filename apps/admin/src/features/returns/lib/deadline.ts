import type { Schema } from '@nile/api';

// The deadline that matters for a return's status (the TL3-Q1 rule): the seller's decision while `requested`,
// the customer's escalation while `rejected`, the seller's inspection while `received`.

type Deadlines = Pick<
  Schema<'AdminReturnDto'>,
  'status' | 'sellerDecisionDeadlineAt' | 'escalationDeadlineAt' | 'inspectionDeadlineAt'
>;

export type DeadlineKind = 'decision' | 'escalation' | 'inspection';

export function currentDeadline(item: Deadlines): { kind: DeadlineKind; at: string } | null {
  if (item.status === 'requested' && item.sellerDecisionDeadlineAt !== null) {
    return { kind: 'decision', at: item.sellerDecisionDeadlineAt };
  }
  if (item.status === 'rejected' && item.escalationDeadlineAt !== null) {
    return { kind: 'escalation', at: item.escalationDeadlineAt };
  }
  if (item.status === 'received' && item.inspectionDeadlineAt !== null) {
    return { kind: 'inspection', at: item.inspectionDeadlineAt };
  }
  return null;
}
