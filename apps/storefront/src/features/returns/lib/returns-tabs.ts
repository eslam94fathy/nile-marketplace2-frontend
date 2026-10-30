import { RETURN_TAB_STATUSES, type ReturnsTab } from '../api';

// Kept out of the 'use client' list so the server page can read the tab from `?status=` (R-29).

export const RETURNS_TABS = Object.keys(RETURN_TAB_STATUSES) as ReturnsTab[];

/** The tab named in the URL; anything unknown is "Open" (invalid URL values are dropped, R-28). */
export function parseReturnsTab(value: string | null | undefined): ReturnsTab {
  return RETURNS_TABS.find((tab) => tab === value) ?? 'open';
}
