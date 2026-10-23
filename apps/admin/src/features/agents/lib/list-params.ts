import { AGENT_STATUSES, type AgentStatus } from '@nile/domain';
import * as z from 'zod';

// AD-09 filters, URL ⇄ API: `?status=&shift=&governorate=&name=`. Invalid values are dropped, never sent
// (R-28). No status is the Active tab (spec 03 AD-09 lists it first); `status=all` is every status.

export const AGENT_LIST_PARAMS = {
  status: 'status',
  shift: 'shift',
  governorate: 'governorate',
  name: 'name',
} as const;

export const ALL_STATUSES = 'all';
export const SHIFT_VALUES = { on: true, off: false } as const;
export type ShiftValue = keyof typeof SHIFT_VALUES;
/** As the sellers' name search (AD-04). */
export const NAME_FILTER_MAX = 100;

export interface AgentFilters {
  /** null = all statuses. */
  readonly status: AgentStatus | null;
  readonly shift: ShiftValue | null;
  readonly governorateId: string | null;
  readonly name: string | null;
}

export type RawAgentParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const single = (value: string | readonly string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

export function parseAgentFilters(params: RawAgentParams): AgentFilters {
  const status = single(params[AGENT_LIST_PARAMS.status]);
  const shift = single(params[AGENT_LIST_PARAMS.shift]);
  const governorate = single(params[AGENT_LIST_PARAMS.governorate]);
  const name = single(params[AGENT_LIST_PARAMS.name])?.trim();
  return {
    status:
      status === ALL_STATUSES
        ? null
        : (AGENT_STATUSES as readonly string[]).includes(status ?? '')
          ? (status as AgentStatus)
          : 'active',
    shift: shift !== undefined && Object.hasOwn(SHIFT_VALUES, shift) ? (shift as ShiftValue) : null,
    governorateId: z.uuid().safeParse(governorate).success ? (governorate ?? null) : null,
    name: name !== undefined && name.length >= 1 && name.length <= NAME_FILTER_MAX ? name : null,
  };
}

/** The query string for filters (no `?`): the default Active tab has no `status`. */
export function agentFiltersQuery(filters: AgentFilters): string {
  const query = new URLSearchParams();
  if (filters.status === null) query.set(AGENT_LIST_PARAMS.status, ALL_STATUSES);
  else if (filters.status !== 'active') query.set(AGENT_LIST_PARAMS.status, filters.status);
  if (filters.shift !== null) query.set(AGENT_LIST_PARAMS.shift, filters.shift);
  if (filters.governorateId !== null) query.set(AGENT_LIST_PARAMS.governorate, filters.governorateId);
  if (filters.name !== null) query.set(AGENT_LIST_PARAMS.name, filters.name);
  return query.toString();
}

/** The API query (literal filter keys), newest first (spec 03 AD-09). */
export function agentApiQuery(filters: AgentFilters) {
  return {
    sort: '-createdAt' as const,
    ...(filters.status === null ? {} : { 'status[eq]': filters.status }),
    ...(filters.shift === null ? {} : { 'onShift[eq]': SHIFT_VALUES[filters.shift] }),
    ...(filters.governorateId === null ? {} : { 'homeGovernorateId[eq]': filters.governorateId }),
    ...(filters.name === null ? {} : { 'fullName[like]': filters.name }),
  };
}

export const hasNarrowingFilters = (filters: AgentFilters): boolean =>
  filters.shift !== null || filters.governorateId !== null || filters.name !== null;
