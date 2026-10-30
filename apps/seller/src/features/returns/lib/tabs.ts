import type { ReturnStatus } from '@nile/domain';

// SE-18 tabs (spec 02 §8.3): the URL keeps the tab (`?tab=<key>`), the API gets the statuses and the tab's
// sort. No parameter (or an unknown one) is "To decide".

export const RETURN_TAB_PARAM = 'tab';

export interface ReturnTab {
  readonly key: string;
  readonly statuses: readonly [ReturnStatus, ...ReturnStatus[]];
  readonly sort: 'createdAt' | '-createdAt' | 'sellerDecisionDeadlineAt';
}

export const RETURN_TABS = [
  { key: 'to-decide', statuses: ['requested'], sort: 'sellerDecisionDeadlineAt' },
  // No inspection-deadline sort exists: oldest first [PROPOSED in spec 02, approved T-J0].
  { key: 'to-check', statuses: ['received'], sort: 'createdAt' },
  {
    key: 'in-progress',
    statuses: ['rejected', 'escalated', 'approved', 'picked_up', 'disputed'],
    sort: '-createdAt',
  },
  { key: 'closed', statuses: ['completed', 'refused', 'cancelled', 'pickup_failed'], sort: '-createdAt' },
] as const satisfies readonly ReturnTab[];

export type ReturnTabKey = (typeof RETURN_TABS)[number]['key'];

export function returnTab(param: string | null | undefined): ReturnTab & { readonly key: ReturnTabKey } {
  return RETURN_TABS.find((tab) => tab.key === param) ?? RETURN_TABS[0];
}

/** The units being returned, across the return's items. */
export const returnedUnits = (item: { readonly items: readonly { readonly quantity: number }[] }): number =>
  item.items.reduce((sum, line) => sum + line.quantity, 0);
