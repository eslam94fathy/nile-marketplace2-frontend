import { PRODUCT_STATUSES, type ProductStatus } from '@nile/domain';
import * as z from 'zod';

// SE-08 filters, URL ⇄ API (spec 02 SE-08): `?status=&category=&name=`. Values that aren't valid are dropped,
// never sent (R-28): the API would refuse them, and a bad link should still show the list.

export const PRODUCT_LIST_PARAMS = { status: 'status', category: 'category', name: 'name' } as const;

/** `name[like]` accepts 1..200 characters [SPEC 01 filters]. */
export const NAME_FILTER_MAX = 200;

export interface ProductFilters {
  readonly status: ProductStatus | null;
  readonly categoryId: string | null;
  readonly name: string | null;
}

export type RawProductParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const single = (value: string | readonly string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

const isStatus = (value: string | undefined): value is ProductStatus =>
  (PRODUCT_STATUSES as readonly string[]).includes(value ?? '');

export function parseProductFilters(params: RawProductParams): ProductFilters {
  const status = single(params[PRODUCT_LIST_PARAMS.status]);
  const category = single(params[PRODUCT_LIST_PARAMS.category]);
  const name = single(params[PRODUCT_LIST_PARAMS.name])?.trim();
  return {
    status: isStatus(status) ? status : null,
    categoryId: z.uuid().safeParse(category).success ? (category ?? null) : null,
    name: name !== undefined && name.length >= 1 && name.length <= NAME_FILTER_MAX ? name : null,
  };
}

/** The query string for filters (no `?`); empty for no filter. */
export function productFiltersQuery(filters: ProductFilters): string {
  const query = new URLSearchParams();
  if (filters.status !== null) query.set(PRODUCT_LIST_PARAMS.status, filters.status);
  if (filters.categoryId !== null) query.set(PRODUCT_LIST_PARAMS.category, filters.categoryId);
  if (filters.name !== null) query.set(PRODUCT_LIST_PARAMS.name, filters.name);
  return query.toString();
}

export const hasFilters = (filters: ProductFilters): boolean =>
  filters.status !== null || filters.categoryId !== null || filters.name !== null;
