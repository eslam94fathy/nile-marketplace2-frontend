import { inValues } from '@nile/api';
import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  cairoDayBounds,
  isCalendarDay,
  type AuditAction,
  type AuditTargetType,
} from '@nile/domain';
import * as z from 'zod';

// AD-38 filters, URL ⇄ API: `?actor=&action=a,b&target=&targetId=&from=&to=` (spec 03 AD-38). Invalid values are
// dropped, never sent (R-28); a target id without a target type is dropped too (the backend refuses it with
// `INVALID_QUERY`). The list is always newest first.

export const AUDIT_LIST_PARAMS = {
  actor: 'actor',
  action: 'action',
  target: 'target',
  targetId: 'targetId',
  from: 'from',
  to: 'to',
} as const;
const ACTION_SEPARATOR = ',';

export interface AuditFilters {
  readonly actorUserId: string | null;
  /** Empty = every action. Kept in `AUDIT_ACTIONS` order, so equal filters give equal keys. */
  readonly actions: readonly AuditAction[];
  readonly targetType: AuditTargetType | null;
  /** Only with a target type. */
  readonly targetId: string | null;
  /** Cairo calendar days `YYYY-MM-DD`, inclusive. */
  readonly from: string | null;
  readonly to: string | null;
}

export type RawAuditParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const single = (value: string | readonly string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
const day = (value: string | undefined) => (value !== undefined && isCalendarDay(value) ? value : null);

export const isUuid = (value: string): boolean => z.uuid().safeParse(value).success;

export function parseAuditFilters(params: RawAuditParams): AuditFilters {
  const actor = single(params[AUDIT_LIST_PARAMS.actor]);
  const actions = new Set(single(params[AUDIT_LIST_PARAMS.action])?.split(ACTION_SEPARATOR) ?? []);
  const target = single(params[AUDIT_LIST_PARAMS.target]);
  const targetType = AUDIT_TARGET_TYPES.find((type) => type === target) ?? null;
  const targetId = single(params[AUDIT_LIST_PARAMS.targetId]);
  const from = day(single(params[AUDIT_LIST_PARAMS.from]));
  const to = day(single(params[AUDIT_LIST_PARAMS.to]));
  return {
    actorUserId: actor !== undefined && isUuid(actor) ? actor : null,
    actions: AUDIT_ACTIONS.filter((action) => actions.has(action)),
    targetType,
    targetId: targetType !== null && targetId !== undefined && isUuid(targetId) ? targetId : null,
    from,
    // A range that ends before it starts is dropped as a whole end.
    to: from !== null && to !== null && to < from ? null : to,
  };
}

/** The query string for filters (no `?`). */
export function auditFiltersQuery(filters: AuditFilters): string {
  const query = new URLSearchParams();
  if (filters.actorUserId !== null) query.set(AUDIT_LIST_PARAMS.actor, filters.actorUserId);
  if (filters.actions.length > 0) query.set(AUDIT_LIST_PARAMS.action, filters.actions.join(ACTION_SEPARATOR));
  if (filters.targetType !== null) {
    query.set(AUDIT_LIST_PARAMS.target, filters.targetType);
    if (filters.targetId !== null) query.set(AUDIT_LIST_PARAMS.targetId, filters.targetId);
  }
  if (filters.from !== null) query.set(AUDIT_LIST_PARAMS.from, filters.from);
  if (filters.to !== null) query.set(AUDIT_LIST_PARAMS.to, filters.to);
  return query.toString();
}

/** The API query (literal filter keys); one action as `[eq]`, several as `[in]`. */
export function auditApiQuery(filters: AuditFilters) {
  const [onlyAction] = filters.actions;
  let actionFilter = {};
  if (filters.actions.length === 1 && onlyAction !== undefined) actionFilter = { 'action[eq]': onlyAction };
  else if (filters.actions.length > 1) actionFilter = { 'action[in]': inValues(filters.actions) };
  return {
    sort: '-createdAt' as const,
    ...(filters.actorUserId === null ? {} : { 'actorUserId[eq]': filters.actorUserId }),
    ...actionFilter,
    ...(filters.targetType === null ? {} : { 'targetType[eq]': filters.targetType }),
    ...(filters.targetType === null || filters.targetId === null ? {} : { 'targetId[eq]': filters.targetId }),
    ...(filters.from === null ? {} : { 'createdAt[gte]': cairoDayBounds(filters.from).start }),
    ...(filters.to === null ? {} : { 'createdAt[lte]': cairoDayBounds(filters.to).end }),
  };
}

export const NO_AUDIT_FILTERS: AuditFilters = {
  actorUserId: null,
  actions: [],
  targetType: null,
  targetId: null,
  from: null,
  to: null,
};

export const hasAuditFilters = (filters: AuditFilters): boolean =>
  filters.actorUserId !== null ||
  filters.actions.length > 0 ||
  filters.targetType !== null ||
  filters.from !== null ||
  filters.to !== null;
