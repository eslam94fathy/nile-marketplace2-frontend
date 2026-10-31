import type { QueryClient } from '@tanstack/react-query';
import { clearIdempotencyIntents } from './intent-store';

/**
 * First key segment (design 01 §6): `public` for data that is the same for every visitor, or the app name
 * for data belonging to the signed-in user. Sign-out removes everything that isn't `public`.
 */
export const QUERY_SCOPES = ['public', 'storefront', 'seller', 'admin', 'agent'] as const;
export type QueryScope = (typeof QUERY_SCOPES)[number];

/** `[scope, resource, kind, params?]`, e.g. `['storefront', 'orders', 'detail', { orderId }]`. */
export type QueryKeyOf<
  S extends QueryScope = QueryScope,
  R extends string = string,
  K extends string = string,
  P extends object | undefined = object | undefined,
> = P extends undefined ? readonly [S, R, K] : readonly [S, R, K, P];

export function queryKey<const S extends QueryScope, const R extends string, const K extends string>(
  scope: S,
  resource: R,
  kind: K,
): readonly [S, R, K];
export function queryKey<
  const S extends QueryScope,
  const R extends string,
  const K extends string,
  const P extends object,
>(scope: S, resource: R, kind: K, params: P): readonly [S, R, K, P];
export function queryKey(
  scope: QueryScope,
  resource: string,
  kind: string,
  params?: object,
): readonly unknown[] {
  return params === undefined ? [scope, resource, kind] : [scope, resource, kind, params];
}

/** Keys of the shared public queries (design 02 §2.1). */
export const publicKeys = {
  categoriesTree: () => queryKey('public', 'categories', 'tree'),
  categoryAttributes: (categoryId: string) => queryKey('public', 'categories', 'attributes', { categoryId }),
  governorates: () => queryKey('public', 'governorates', 'list'),
};

/** Drops every user-specific query (sign-out, session ended); public data stays cached. */
export function clearPrivateQueries(client: QueryClient): void {
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'public' });
  // Unresolved intents belong to the user who signed out (T-O1 F-1).
  clearIdempotencyIntents();
}
