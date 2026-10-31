import { isApiError, unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';
import { auditApiQuery, type AuditFilters } from './lib/list-params';

// Audit log (spec 03 AD-38, AD-39; design 02 §5.2 `audit.list` / `.detail`, default staleness). Admin reads aren't
// audited (backend spec 20 BO-3), so reading the log leaves no trace in it.

export type AuditEntry = Schema<'AuditEntryDto'>;

const AUDIT_PAGE_SIZE = 20;

export const auditKeys = {
  lists: () => queryKey('admin', 'audit', 'list'),
  list: (filters: AuditFilters) => queryKey('admin', 'audit', 'list', filters),
  detail: (entryId: string) => queryKey('admin', 'audit', 'detail', { entryId }),
};

export function auditListOptions(filters: AuditFilters) {
  return infiniteListOptions({
    queryKey: auditKeys.list(filters),
    fetchPage: async (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/audit-log', {
          params: {
            query: {
              limit: AUDIT_PAGE_SIZE,
              ...auditApiQuery(filters),
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
  });
}

export function auditEntryQuery(entryId: string) {
  return queryOptions({
    queryKey: auditKeys.detail(entryId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/audit-log/{entryId}', { params: { path: { entryId } }, signal }),
        )
      ).data,
  });
}

/** No such entry (deleted by retention after 730 days), or not an entry id at all (checked first, as R-36). */
export function isAuditEntryMissing(error: unknown): boolean {
  return isApiError(error, 'AUDIT_ENTRY_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}
