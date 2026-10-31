import { unwrap, type Schema } from '@nile/api';
import { queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// AD-02 figures (spec 03 §7.3, design 02 §5.2 `dashboard`). Every dashboard query lives under the `dashboard`
// prefix, so `support.ticket_updated` refreshes the figures and the cards at once (design 02 §5.3).

export type DashboardFigures = Schema<'DashboardDto'>;

/** The backend caches the figures for 60 s (backend spec 20 §3.2), so a fresher read is never useful. */
export const DASHBOARD_FIGURES_STALE_MS = 60_000;

export const dashboardKeys = {
  all: () => ['admin', 'dashboard'] as const,
  figures: () => queryKey('admin', 'dashboard', 'figures'),
  ticketsWaiting: () => queryKey('admin', 'dashboard', 'ticketsWaiting'),
  returnsToDecide: () => queryKey('admin', 'dashboard', 'returnsToDecide'),
};

/** `GET /admin/dashboard`: no polling (AD-Q-16); "Refresh" and live messages read it again. */
export function dashboardFiguresOptions() {
  return queryOptions({
    queryKey: dashboardKeys.figures(),
    queryFn: async ({ signal }) => (await unwrap(browserApi.GET('/api/v1/admin/dashboard', { signal }))).data,
    staleTime: DASHBOARD_FIGURES_STALE_MS,
  });
}
