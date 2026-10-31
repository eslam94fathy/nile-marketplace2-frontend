import { SUPPORT_TAB_STATUSES, type SupportTab } from './api';

// Kept out of the 'use client' screens so a server page can read the tab from `?status=` (design 01 R-29).

export const SUPPORT_TABS = Object.keys(SUPPORT_TAB_STATUSES) as SupportTab[];

/** Query parameter of the list tab (spec 01 SF-29 `?status=open|closed`). */
export const SUPPORT_TAB_PARAM = 'status';

/** The tab named in the URL; anything unknown is "Open" (invalid URL values are dropped, design 01 R-28). */
export function parseSupportTab(value: string | null | undefined): SupportTab {
  return SUPPORT_TABS.find((tab) => tab === value) ?? 'open';
}
